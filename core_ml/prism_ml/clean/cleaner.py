import polars as pl
from typing import Dict, Any
from prism_ml.exceptions import DataLoadError, CleaningConfigurationError
import os
import uuid
import s3fs

class PrismCleaner:
    def __init__(self):
        print("🧹 Semantic Prism Cleaner Initialized")
        
        # Cloud Authentication Credentials
        self.s3_endpoint = os.getenv("MINIO_ENDPOINT_URL", "http://127.0.0.1:9000")
        self.s3_key = os.getenv("MINIO_ACCESS_KEY", "prismadmin")
        self.s3_secret = os.getenv("MINIO_SECRET_KEY", "prismpassword")
        
        self.storage_options = {
            "aws_endpoint_url": self.s3_endpoint,
            "aws_access_key_id": self.s3_key,
            "aws_secret_access_key": self.s3_secret,
            "aws_region": "us-east-1",
            "aws_allow_http": "true" 
        }

    def _get_filesystem(self, is_s3: bool):
        """Returns the appropriate filesystem client for writing."""
        if is_s3:
            return s3fs.S3FileSystem(
                client_kwargs={'endpoint_url': self.s3_endpoint},
                key=self.s3_key,
                secret=self.s3_secret
            )
        return None

    def execute_cleaning(self, node_id: str, file_path: str, parameters: Dict[str, Any]) -> tuple[pl.DataFrame, str]:
        print(f"📥 Loading structurally sound dataset from: {file_path}")
        
        is_s3 = file_path.startswith("s3://")
        
        try:
            # THE FIX: I/O Abstraction for Reading
            read_kwargs = {
            "separator": ",",
            "null_values": ["NA", "N/A", "null", "NaN", "?", "", " ", "-", "unknown", "Unknown"],
            "ignore_errors": True,
            "truncate_ragged_lines": True,
            "quote_char": None  # <--- THE MISSING MAGIC SHIELD
        }
            
            # Decapitate Polars' S3 engine. Read bytes natively via s3fs.
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

        # 1. GHOST PURGE
        if parameters.get("auto_purge", True):
            df = self._purge_bad_columns(df)

        # 2. THE "DAVIS, DAVIS" SEMANTIC ROW BOUNCER
        df = self._semantic_row_bouncer(df)

        lazy_df = df.lazy()

        # 3. INTELLIGENT TYPE COERCION
        if parameters.get("coerce_types", True):
            lazy_df = self._apply_smart_coercion(lazy_df)

        # 4. AI-DRIVEN & FALLBACK CLEANING RULES
        lazy_df = self._apply_deduplication(lazy_df, parameters.get("remove_duplicates", False))
        lazy_df = self._apply_drops(lazy_df, parameters.get("drop_columns", []))
        lazy_df = self._apply_imputations(lazy_df, parameters.get("impute_rules", {}))

        print("⚙️ Executing Optimized Lazy Query Plan via Polars Streaming...")
        try:
            cleaned_df = lazy_df.collect(streaming=True)
            cleaned_df = self._normalize_categorical_spelling(cleaned_df)

            print(f"✅ Semantic data cleaning complete. Final shape: {cleaned_df.shape}")
            
            # THE FIX: I/O Abstraction for Writing
            run_id = uuid.uuid4().hex[:8]
            
            if is_s3:
                # Use forward slashes to navigate cloud directories safely
                directory = "/".join(file_path.split("/")[:-1])
                save_path = f"{directory}/cleaned_dataset_{run_id}.csv"
                
                fs = self._get_filesystem(is_s3=True)
                with fs.open(save_path, 'wb') as f:
                    cleaned_df.write_csv(f)
            else:
                # Use standard os paths for local runs
                dataset_directory = os.path.dirname(file_path)
                save_path = os.path.join(dataset_directory, f"cleaned_dataset_{run_id}.csv")
                cleaned_df.write_csv(save_path)
            
            print(f"💾 Cleaned dataset safely handed off to disk/cloud at: {save_path}")
            return cleaned_df, save_path
            
        except Exception as e:
            raise CleaningConfigurationError(node_id=node_id, message=f"Streaming execution failed: {e}")

    # ==========================================
    # MODULAR QUERY BUILDERS (Untouched)
    # ==========================================

    def _purge_bad_columns(self, df: pl.DataFrame) -> pl.DataFrame:
        cols_to_drop = []
        row_count = df.height
        
        for col in df.columns:
            null_count = df[col].null_count()
            if null_count > (row_count * 0.90):
                cols_to_drop.append(col)
                continue
            if df[col].n_unique() == 1:
                cols_to_drop.append(col)
                continue

        if cols_to_drop:
            print(f"🗑️ Auto-Purged Sparse/Garbage Columns: {cols_to_drop}")
            df = df.drop(cols_to_drop)
        return df
        
    def _semantic_row_bouncer(self, df: pl.DataFrame) -> pl.DataFrame:
        if len(df.columns) >= 2:
            col0 = df.columns[0]
            col1 = df.columns[1]
            
            mask = (df[col0] == df[col1]) & (df[col0].is_not_null()) & (df[col0].cast(pl.String).str.strip_chars() != "")
            
            shifted_count = mask.sum()
            if shifted_count > 0:
                print(f"🚨 Semantic Bouncer: Dropped {shifted_count} critically shifted rows (Detected '{col0}' == '{col1}')")
                df = df.filter(~mask)
                
        return df

    def _apply_smart_coercion(self, lazy_df: pl.LazyFrame) -> pl.LazyFrame:
        df = lazy_df.collect()
        
        for col in df.columns:
            if df[col].dtype == pl.Utf8:
                numeric_cleaning = df.get_column(col).str.replace_all(r"[$,%\"'?Ł£€ ]", "")
                casted_numbers = numeric_cleaning.cast(pl.Float64, strict=False)
                
                original_nulls = df.get_column(col).null_count()
                new_nulls = casted_numbers.null_count()
                
                non_null_count = df.height - original_nulls
                valid_numbers = df.height - new_nulls
                
                if valid_numbers > 0 and valid_numbers >= (non_null_count * 0.50):
                    df = df.with_columns(casted_numbers.alias(col))
                else:
                    basic_clean = df.get_column(col).str.strip_chars()
                    df = df.with_columns(basic_clean.alias(col))
                    
        return df.lazy()

    def _apply_deduplication(self, lazy_df: pl.LazyFrame, remove_dupes: bool) -> pl.LazyFrame:
        if remove_dupes:
            return lazy_df.unique()
        return lazy_df

    def _apply_drops(self, lazy_df: pl.LazyFrame, drop_cols: list) -> pl.LazyFrame:
        if drop_cols:
            return lazy_df.drop(drop_cols, strict=False) 
        return lazy_df

    def _apply_imputations(self, lazy_df: pl.LazyFrame, impute_rules: Dict[str, str]) -> pl.LazyFrame:
        schema = lazy_df.collect_schema()
        exprs = []
        
        for col_name, dtype in schema.items():
            is_numeric = dtype in [pl.Int64, pl.Int32, pl.Float64, pl.Float32]
            is_string = dtype == pl.Utf8
            
            strategy = impute_rules.get(col_name, "auto")
            
            if strategy == "skip":
                continue
            elif strategy == "median" or (strategy == "auto" and is_numeric):
                exprs.append(pl.col(col_name).fill_null(pl.col(col_name).median()))
            elif strategy == "mean":
                exprs.append(pl.col(col_name).fill_null(pl.col(col_name).mean()))
            elif strategy == "mode":
                exprs.append(pl.col(col_name).fill_null(pl.col(col_name).mode().first()))
            elif strategy == "constant_unknown" or (strategy == "auto" and is_string):
                exprs.append(pl.col(col_name).fill_null("Unknown"))

        if exprs:
            lazy_df = lazy_df.with_columns(exprs)
        return lazy_df

    def _normalize_categorical_spelling(self, df: pl.DataFrame) -> pl.DataFrame:
        exprs = []
        for col in df.columns:
            if df[col].dtype == pl.Utf8:
                exprs.append(pl.col(col).str.to_lowercase().str.strip_chars())
        if exprs:
            df = df.with_columns(exprs)
        return df