import polars as pl
from typing import Dict, Any, Tuple
from prism_ml.exceptions import DataLoadError, CleaningConfigurationError
import os
import uuid
import s3fs

class PrismCleaner:
    def __init__(self):
        print("🧹 Semantic Prism Cleaner Initialized")
        
        self.s3_endpoint = os.getenv("MINIO_ENDPOINT_URL", "http://127.0.0.1:9000")
        self.s3_key = os.getenv("MINIO_ACCESS_KEY", "prismadmin")
        self.s3_secret = os.getenv("MINIO_SECRET_KEY", "prismpassword")

    def _get_filesystem(self, is_s3: bool):
        if is_s3:
            return s3fs.S3FileSystem(
                client_kwargs={'endpoint_url': self.s3_endpoint},
                key=self.s3_key,
                secret=self.s3_secret
            )
        return None

    def execute_cleaning(self, node_id: str, file_path: str, parameters: Dict[str, Any]) -> Tuple[pl.DataFrame, str, dict]:
        print(f"📥 Loading structurally sound dataset from: {file_path}")
        is_s3 = file_path.startswith("s3://")
        
        try:
            read_kwargs = {
                "separator": ",",
                "null_values": ["NA", "N/A", "null", "NaN", "?", "", " ", "-", "unknown", "Unknown"],
                "ignore_errors": True,
                "truncate_ragged_lines": True
                # Quote char purposely left enabled to prevent thousand-separator fragmentation
            }
            
            if is_s3:
                fs = self._get_filesystem(is_s3=True)
                with fs.open(file_path, 'rb') as f:
                    file_bytes = f.read()
                df = pl.read_csv(file_bytes, **read_kwargs)
            else:
                df = pl.read_csv(file_path, **read_kwargs)
            
        except Exception as e:
            raise DataLoadError(file_path=file_path, message=str(e))

        if not parameters:
            raise CleaningConfigurationError(node_id=node_id, message="Parameters cannot be empty.")

        if parameters.get("auto_purge", True):
            df = self._purge_bad_columns(df)

        # Generate the structured metadata to be stored in PostgreSQL
        column_roles = self._classify_column_roles(df)

        df = self._semantic_row_bouncer(df)
        lazy_df = df.lazy()

        if parameters.get("coerce_types", True):
            lazy_df = self._apply_smart_coercion(lazy_df)

        lazy_df = self._apply_deduplication(lazy_df, parameters.get("remove_duplicates", False))
        lazy_df = self._apply_drops(lazy_df, parameters.get("drop_columns", []))
        lazy_df = self._apply_imputations(lazy_df, parameters.get("impute_rules", {}), column_roles)

        print("⚙️ Executing Optimized Lazy Query Plan...")
        try:
            # Removed streaming=True to preserve exact row order for human readability
            cleaned_df = lazy_df.collect()
            cleaned_df = self._normalize_categorical_spelling(cleaned_df)
            print(f"✅ Semantic data cleaning complete. Final shape: {cleaned_df.shape}")
            
            run_id = uuid.uuid4().hex[:8]
            
            if is_s3:
                directory = "/".join(file_path.split("/")[:-1])
                save_path = f"{directory}/cleaned_dataset_{run_id}.csv"
                fs = self._get_filesystem(is_s3=True)
                with fs.open(save_path, 'wb') as f:
                    cleaned_df.write_csv(f)
            else:
                dataset_directory = os.path.dirname(file_path)
                save_path = os.path.join(dataset_directory, f"cleaned_dataset_{run_id}.csv")
                cleaned_df.write_csv(save_path)
            
            print(f"💾 Cleaned dataset safely handed off to MinIO at: {save_path}")
            
            # Return the dataframe, the S3 path, AND the Postgres-bound metadata
            return cleaned_df, save_path, column_roles
            
        except Exception as e:
            raise CleaningConfigurationError(node_id=node_id, message=f"Execution failed: {e}")

    def _classify_column_roles(self, df: pl.DataFrame) -> dict:
        """Detects identifiers and dates to prevent bad downstream encoding/imputation."""
        roles = {}
        row_count = df.height
        if row_count == 0: return roles

        for col, dtype in df.schema.items():
            # 1. Identifier Detection 
            if dtype in [pl.Utf8, pl.Int64, pl.Int32]:
                non_null_count = df.height - df[col].null_count()
                
                if non_null_count > 10:
                    unique_count = df[col].n_unique()
                    
                    # Raised to 0.75 so numeric features like "Payments" aren't caught by mistake
                    if (unique_count / non_null_count) >= 0.75:
                        roles[col] = "identifier"
                        print(f"🔍 Classified '{col}' as Identifier (Uniqueness: {unique_count/non_null_count:.1%})")
                        continue
                
            # 2. Date Detection (Strings only)
            if dtype == pl.Utf8:
                sample = df[col].drop_nulls().head(100)
                if len(sample) > 0:
                    date_like = sample.str.contains(r"\d{2,4}[-/]\d{1,2}[-/]\d{1,4}").sum()
                    if date_like / len(sample) > 0.5:
                        roles[col] = "date"
                        print(f"🔍 Classified '{col}' as Date/Time feature.")
                        continue
        return roles

    
    def _purge_bad_columns(self, df: pl.DataFrame) -> pl.DataFrame:
        cols_to_drop = []
        row_count = df.height
        for col in df.columns:
            # 1. Always drop columns that are 90%+ completely empty
            if df[col].null_count() > (row_count * 0.90):
                cols_to_drop.append(col)
                
            # 2. PROACTIVE FIX: Only drop zero-variance columns if we have a decent sample size (> 50 rows).
            # This protects small datasets (like trial.csv) from accidentally losing valid columns.
            elif row_count > 50 and df[col].n_unique() == 1:
                cols_to_drop.append(col)
                
        if cols_to_drop:
            print(f"🗑️ Auto-Purging useless columns: {cols_to_drop}")
            df = df.drop(cols_to_drop)
        return df
        
    def _semantic_row_bouncer(self, df: pl.DataFrame) -> pl.DataFrame:
        if len(df.columns) >= 2:
            col0, col1 = df.columns[0], df.columns[1]
            # THE FIX: Safely cast both columns to Utf8 (String) before doing the equality check.
            # This prevents Polars from crashing when comparing an Integer ID to a String Name.
            mask = (df[col0].cast(pl.Utf8, strict=False) == df[col1].cast(pl.Utf8, strict=False)) & (df[col0].is_not_null()) & (df[col0].cast(pl.Utf8, strict=False).str.strip_chars() != "")
            
            # fill_null(False) ensures that any nulls in the mask don't crash the .filter() method
            if mask.fill_null(False).sum() > 0:
                df = df.filter(~mask.fill_null(False))
        return df

    def _apply_smart_coercion(self, lazy_df: pl.LazyFrame) -> pl.LazyFrame:
        df = lazy_df.collect()
        for col in df.columns:
            if df[col].dtype == pl.Utf8:
                numeric_cleaning = df.get_column(col).str.replace_all(r"[$,%\"'?Ł£€ ]", "")
                casted_numbers = numeric_cleaning.cast(pl.Float64, strict=False)
                if (df.height - casted_numbers.null_count()) >= ((df.height - df.get_column(col).null_count()) * 0.50):
                    df = df.with_columns(casted_numbers.alias(col))
                else:
                    df = df.with_columns(df.get_column(col).str.strip_chars().alias(col))
        return df.lazy()

    def _apply_deduplication(self, lazy_df: pl.LazyFrame, remove_dupes: bool) -> pl.LazyFrame:
        # Added maintain_order=True to stop Polars from randomly shuffling the data rows
        return lazy_df.unique(maintain_order=True) if remove_dupes else lazy_df

    def _apply_drops(self, lazy_df: pl.LazyFrame, drop_cols: list) -> pl.LazyFrame:
        return lazy_df.drop(drop_cols, strict=False) if drop_cols else lazy_df

    def _apply_imputations(self, lazy_df: pl.LazyFrame, impute_rules: Dict[str, str], column_roles: dict) -> pl.LazyFrame:
        exprs = []
        schema = lazy_df.collect_schema()
        
        for col_name, dtype in schema.items():
            strategy = impute_rules.get(col_name, "auto")
            is_numeric = dtype in [pl.Int64, pl.Int32, pl.Float64, pl.Float32]
            
            if strategy == "skip": 
                continue
                
            # If it is an identifier, never leave it blank. Cast to string and fill with "Unknown".
            if column_roles.get(col_name) == "identifier":
                exprs.append(pl.col(col_name).cast(pl.Utf8).fill_null("Unknown"))
                continue
                
            if strategy == "median" or (strategy == "auto" and is_numeric):
                exprs.append(pl.col(col_name).fill_null(pl.col(col_name).median()))
            elif strategy == "mean":
                exprs.append(pl.col(col_name).fill_null(pl.col(col_name).mean()))
            elif strategy == "mode":
                exprs.append(pl.col(col_name).fill_null(pl.col(col_name).mode().first()))
            elif strategy == "constant_unknown" or (strategy == "auto" and dtype == pl.Utf8):
                exprs.append(pl.col(col_name).cast(pl.Utf8).fill_null("Unknown"))

        return lazy_df.with_columns(exprs) if exprs else lazy_df

    def _normalize_categorical_spelling(self, df: pl.DataFrame) -> pl.DataFrame:
        exprs = [pl.col(col).str.to_lowercase().str.strip_chars() for col, dtype in df.schema.items() if dtype == pl.Utf8]
        return df.with_columns(exprs) if exprs else df