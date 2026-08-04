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

    def execute_cleaning(self, node_id: str, file_path: str, parameters: Dict[str, Any], run_id: str) -> Tuple[pl.DataFrame, str, dict]:
        print(f"📥 Loading structurally sound dataset from: {file_path}")
        is_s3 = file_path.startswith("s3://")
        
        try:
            read_kwargs = {
                "separator": ",",
                "null_values": ["NA", "N/A", "null", "NaN", "?", "", " ", "-", "unknown", "Unknown"],
                "ignore_errors": True,
                "truncate_ragged_lines": True
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

        blueprint = {
            "__dropped_columns__": [],
            "__coerced_numeric_columns__": [],
            "__imputations__": {},
            "__final_column_sequence__": []
        }

        # Eager execution required here to check row counts and uniqueness
        if parameters.get("auto_purge", True):
            df = self._purge_bad_columns(df, blueprint)

        column_roles = self._classify_column_roles(df)
        blueprint.update(column_roles)

        # ==========================================
        # 🔥 IGNITE POLARS LAZY ENGINE 🔥
        # ==========================================
        lazy_df = df.lazy()

        lazy_df = self._semantic_row_bouncer(lazy_df)

        if parameters.get("coerce_types", True):
            lazy_df = self._apply_smart_coercion(lazy_df, blueprint)

        lazy_df = self._apply_deduplication(lazy_df, parameters.get("remove_duplicates", False))
        lazy_df = self._apply_drops(lazy_df, parameters.get("drop_columns", []), blueprint)
        
        # True Polars optimization: Parallel Aggregation -> Literal Injection
        lazy_df = self._apply_imputations(lazy_df, parameters.get("impute_rules", {}), column_roles, blueprint)

        print("⚙️ Executing Optimized Lazy Query Plan...")
        try:
            # Polars executes the entire optimized graph simultaneously right here
            cleaned_df = lazy_df.collect()
            cleaned_df = self._normalize_categorical_spelling(cleaned_df)
            
            blueprint["__final_column_sequence__"] = cleaned_df.columns
            
            print(f"✅ Semantic data cleaning complete. Final shape: {cleaned_df.shape}")
            
            
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
            
            return cleaned_df, save_path, blueprint
            
        except Exception as e:
            raise CleaningConfigurationError(node_id=node_id, message=f"Execution failed: {e}")

    def _classify_column_roles(self, df: pl.DataFrame) -> dict:
        roles = {}
        row_count = df.height
        if row_count == 0: return roles

        for col, dtype in df.schema.items():
            if dtype in [pl.Utf8, pl.Int64, pl.Int32]:
                non_null_count = df.height - df[col].null_count()
                if non_null_count > 10:
                    unique_count = df[col].n_unique()
                    if (unique_count / non_null_count) >= 0.75:
                        roles[col] = "identifier"
                        print(f"🔍 Classified '{col}' as Identifier (Uniqueness: {unique_count/non_null_count:.1%})")
                        continue
                
            if dtype == pl.Utf8:
                sample = df[col].drop_nulls().head(100)
                if len(sample) > 0:
                    date_like = sample.str.contains(r"\d{2,4}[-/]\d{1,2}[-/]\d{1,4}").sum()
                    if date_like / len(sample) > 0.5:
                        roles[col] = "date"
                        print(f"🔍 Classified '{col}' as Date/Time feature.")
                        continue
        return roles

    def _purge_bad_columns(self, df: pl.DataFrame, blueprint: dict) -> pl.DataFrame:
        cols_to_drop = []
        row_count = df.height
        for col in df.columns:
            if df[col].null_count() > (row_count * 0.90):
                cols_to_drop.append(col)
            elif row_count > 50 and df[col].n_unique() == 1:
                cols_to_drop.append(col)
                
        if cols_to_drop:
            print(f"🗑️ Auto-Purging useless columns: {cols_to_drop}")
            df = df.drop(cols_to_drop)
            blueprint["__dropped_columns__"].extend(cols_to_drop)
        return df
        
    def _semantic_row_bouncer(self, lazy_df: pl.LazyFrame) -> pl.LazyFrame:
        columns = lazy_df.collect_schema().names()
        if len(columns) >= 2:
            col0, col1 = columns[0], columns[1]
            mask = (pl.col(col0).cast(pl.Utf8, strict=False) == pl.col(col1).cast(pl.Utf8, strict=False)) & (pl.col(col0).is_not_null()) & (pl.col(col0).cast(pl.Utf8, strict=False).str.strip_chars() != "")
            lazy_df = lazy_df.filter(~mask.fill_null(False))
        return lazy_df

    def _apply_smart_coercion(self, lazy_df: pl.LazyFrame, blueprint: dict) -> pl.LazyFrame:
        schema = lazy_df.collect_schema()
        str_cols = [col for col, dtype in schema.items() if dtype == pl.Utf8]
        
        if not str_cols: return lazy_df
        
        # Professional ML approach: Build ONE lazy query to calculate all null percentages simultaneously
        agg_exprs = [pl.len().alias("total_rows")]
        for col in str_cols:
            numeric_cleaning = pl.col(col).str.replace_all(r"[$,%\"'?Ł£€ ]", "")
            casted_numbers = numeric_cleaning.cast(pl.Float64, strict=False)
            agg_exprs.append(casted_numbers.null_count().alias(f"{col}_cast_nulls"))
            agg_exprs.append(pl.col(col).null_count().alias(f"{col}_orig_nulls"))
            
        # Collect exactly 1 row of metadata lightning fast
        stats = lazy_df.select(agg_exprs).collect().to_dicts()[0]
        total_rows = stats["total_rows"]
        
        exprs = []
        coerced_cols = []
        
        for col in schema.names():
            if col in str_cols:
                cast_nulls = stats[f"{col}_cast_nulls"]
                orig_nulls = stats[f"{col}_orig_nulls"]
                
                if (total_rows - cast_nulls) >= ((total_rows - orig_nulls) * 0.50):
                    exprs.append(pl.col(col).str.replace_all(r"[$,%\"'?Ł£€ ]", "").cast(pl.Float64, strict=False).alias(col))
                    coerced_cols.append(col)
                else:
                    exprs.append(pl.col(col).str.strip_chars().alias(col))
            else:
                exprs.append(pl.col(col))
                
        blueprint["__coerced_numeric_columns__"] = coerced_cols
        return lazy_df.select(exprs)

    def _apply_deduplication(self, lazy_df: pl.LazyFrame, remove_dupes: bool) -> pl.LazyFrame:
        return lazy_df.unique(maintain_order=True) if remove_dupes else lazy_df

    def _apply_drops(self, lazy_df: pl.LazyFrame, drop_cols: list, blueprint: dict) -> pl.LazyFrame:
        columns = lazy_df.collect_schema().names()
        actual_drops = [c for c in drop_cols if c in columns]
        if actual_drops:
            blueprint["__dropped_columns__"].extend(actual_drops)
            return lazy_df.drop(actual_drops, strict=False)
        return lazy_df

    def _apply_imputations(self, lazy_df: pl.LazyFrame, impute_rules: Dict[str, str], column_roles: dict, blueprint: dict) -> pl.LazyFrame:
        schema = lazy_df.collect_schema()
        
        # Step 1: Sweep the data ONCE and calculate every requested median/mean/mode simultaneously
        agg_exprs = []
        for col_name, dtype in schema.items():
            strategy = impute_rules.get(col_name, "auto")
            is_numeric = dtype in [pl.Int64, pl.Int32, pl.Float64, pl.Float32]
            
            if strategy == "median" or (strategy == "auto" and is_numeric):
                agg_exprs.append(pl.col(col_name).median().alias(f"{col_name}_median"))
            elif strategy == "mean":
                agg_exprs.append(pl.col(col_name).mean().alias(f"{col_name}_mean"))
            elif strategy == "mode":
                agg_exprs.append(pl.col(col_name).drop_nulls().mode().first().alias(f"{col_name}_mode"))

        # Execute ONE blazing-fast collection to get just the math constants (a 1-row table)
        math_constants = {}
        if agg_exprs:
            constants_df = lazy_df.select(agg_exprs).collect()
            math_constants = constants_df.to_dicts()[0]

        # Step 2: Build the final lazy expressions injecting the extracted constants OR custom values
        exprs = []
        for col_name, dtype in schema.items():
            strategy = str(impute_rules.get(col_name, "auto")).strip()
            is_numeric = dtype in [pl.Int64, pl.Int32, pl.Float64, pl.Float32]
            
            if strategy == "skip": 
                continue
                
            if column_roles.get(col_name) == "identifier":
                blueprint["__imputations__"][col_name] = {"strategy": "constant_unknown", "fill_value": "Unknown"}
                exprs.append(pl.col(col_name).cast(pl.Utf8).fill_null(pl.lit("Unknown")))
                continue

            if strategy == "median" or (strategy == "auto" and is_numeric):
                val = math_constants.get(f"{col_name}_median")
                if val is None: val = 0.0
                blueprint["__imputations__"][col_name] = {"strategy": "median", "fill_value": val}
                exprs.append(pl.col(col_name).fill_null(pl.lit(val)))
                
            elif strategy == "mean":
                val = math_constants.get(f"{col_name}_mean")
                if val is None: val = 0.0
                blueprint["__imputations__"][col_name] = {"strategy": "mean", "fill_value": val}
                exprs.append(pl.col(col_name).fill_null(pl.lit(val)))
                
            elif strategy == "mode":
                val = math_constants.get(f"{col_name}_mode")
                if val is None: val = 0.0 if is_numeric else "Unknown"
                blueprint["__imputations__"][col_name] = {"strategy": "mode", "fill_value": val}
                exprs.append(pl.col(col_name).fill_null(pl.lit(val)))
                
            elif strategy == "constant_unknown" or (strategy == "auto" and dtype == pl.Utf8):
                blueprint["__imputations__"][col_name] = {"strategy": "constant_unknown", "fill_value": "Unknown"}
                exprs.append(pl.col(col_name).cast(pl.Utf8).fill_null(pl.lit("Unknown")))
                
            else:
                # 🚀 THE FIX: Catch-All for Custom Strings and Numbers 🚀
                if is_numeric:
                    try:
                        custom_val = float(strategy)
                        blueprint["__imputations__"][col_name] = {"strategy": "custom_numeric", "fill_value": custom_val}
                        exprs.append(pl.col(col_name).fill_null(pl.lit(custom_val)))
                    except ValueError:
                        print(f"⚠️ Warning: Tried to inject string '{strategy}' into numeric column '{col_name}'. Skipping.")
                else:
                    blueprint["__imputations__"][col_name] = {"strategy": "custom_string", "fill_value": strategy}
                    exprs.append(pl.col(col_name).cast(pl.Utf8).fill_null(pl.lit(strategy)))

        return lazy_df.with_columns(exprs) if exprs else lazy_df

    def _normalize_categorical_spelling(self, df: pl.DataFrame) -> pl.DataFrame:
        exprs = [pl.col(col).str.to_lowercase().str.strip_chars() for col, dtype in df.schema.items() if dtype == pl.Utf8]
        return df.with_columns(exprs) if exprs else df