import polars as pl
from typing import Dict, Any, Tuple
import os
import uuid
import s3fs
import re
import pandas as pd

class PrismEngineer:
    def __init__(self):
        print("🔬 Prism Feature Engineer Initialized")
        
        # Cloud Authentication Credentials
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

    def execute_engineering(self, node_id: str, file_path: str, parameters: Dict[str, Any], run_id: str) -> Tuple[pl.DataFrame, str, dict]:
        print(f"📥 Loading dataset for feature engineering from: {file_path}")
        
        is_s3 = file_path.startswith("s3://")
        
        try:
            read_kwargs = {"ignore_errors": True}
            
            if is_s3:
                fs = self._get_filesystem(is_s3=True)
                with fs.open(file_path, 'rb') as f:
                    file_bytes = f.read()
                df = pl.read_csv(file_bytes, **read_kwargs)
            else:
                df = pl.read_csv(file_path, **read_kwargs)
                
        except Exception as e:
            raise ValueError(f"Feature Engineering failed to load file {file_path}: {str(e)}")

        if not parameters:
            raise ValueError(f"Node {node_id}: Parameters cannot be empty.")

        # Extract existing blueprint or start a fresh dictionary
        blueprint = parameters.get("column_roles", {})
        
        # Initialize Engineering Blueprint Sections
        blueprint["__engineered_dropped_columns__"] = []
        blueprint["__date_decompositions__"] = []
        blueprint["__ohe_mappings__"] = {}
        blueprint["__scaling_params__"] = {}
        blueprint["__column_rename_map__"] = {}

        # Safely extract target column
        target_col = parameters.get("target_column")
        if target_col:
            target_col = target_col.strip()
            for col in df.columns:
                if col.strip().lower() == target_col.lower():
                    target_col = col
                    break

        exclude_cols = parameters.get("exclude_columns", [])

        # ==========================================
        # 1. THE PRE-EMPTIVE PURGE
        # ==========================================
        cols_to_drop = []
        for col in df.columns:
            if (blueprint.get(col) == "identifier" or col in exclude_cols) and col != target_col:
                cols_to_drop.append(col)
                
        if cols_to_drop:
            print(f"🗑️ Purging non-predictive columns from ML Matrix: {cols_to_drop}")
            df = df.drop(cols_to_drop, strict=False)
            blueprint["__engineered_dropped_columns__"].extend(cols_to_drop)

        # ==========================================
        # 2. DECOMPOSE DATES
        # ==========================================
        df = self._decompose_dates(df, blueprint)

        # ==========================================
        # 3. ENCODE CATEGORICALS (OHE)
        # ==========================================
        # Safely parse boolean flag from string or bool
        encode_param = parameters.get("encode_categoricals", True)
        encode_flag = str(encode_param).lower() == "true" if isinstance(encode_param, str) else bool(encode_param)
        manual_cols = parameters.get("manual_encode_cols", [])

        if encode_flag or manual_cols:
            df = self._apply_one_hot_encoding(df, target_col, blueprint, encode_flag, manual_cols)

        # Switch to Lazy Engine for Scaling & Final Collection
        lazy_df = df.lazy()

        # ==========================================
        # 4. FEATURE SCALING
        # ==========================================
        scale_method = parameters.get("scale_method", "none").lower()
        if scale_method in ["standard", "minmax"]:
            lazy_df = self._apply_scaling(lazy_df, scale_method, target_col, blueprint)

        print("⚙️ Executing Feature Engineering Math via Polars Streaming...")
        try:
            engineered_df = lazy_df.collect(streaming=True)
            
            # Data Schema Governance: Clean column names for ML compatibility
            orig_cols = list(engineered_df.columns)
            safe_columns = [re.sub(r'[^a-zA-Z0-9_]', '_', col) for col in orig_cols]
            
            rename_map = dict(zip(orig_cols, safe_columns))
            blueprint["__column_rename_map__"] = rename_map
            engineered_df = engineered_df.rename(rename_map)
            
            # Save final column order for prediction inputs
            blueprint["__final_ml_matrix_columns__"] = list(engineered_df.columns)
            if target_col in rename_map:
                blueprint["__final_target_column__"] = rename_map[target_col]
            else:
                blueprint["__final_target_column__"] = target_col
            
            print(f"✅ Feature Engineering complete. Final ML Matrix shape: {engineered_df.shape}")
            
            
            if is_s3:
                directory = "/".join(file_path.split("/")[:-1])
                save_path = f"{directory}/engineered_dataset_{run_id}.csv"
                
                fs = self._get_filesystem(is_s3=True)
                with fs.open(save_path, 'wb') as f:
                    engineered_df.write_csv(f)
            else:
                dataset_directory = os.path.dirname(file_path)
                save_path = os.path.join(dataset_directory, f"engineered_dataset_{run_id}.csv")
                engineered_df.write_csv(save_path)
            
            print(f"💾 ML-ready matrix safely handed off to disk/cloud at: {save_path}")
            return engineered_df, save_path, blueprint
            
        except Exception as e:
            raise ValueError(f"Node {node_id}: Engineering execution failed: {e}")

    # ==========================================
    # MATHEMATICAL TRANSFORMERS
    # ==========================================

    def _decompose_dates(self, df: pl.DataFrame, blueprint: dict) -> pl.DataFrame:
        date_cols = [col for col, role in blueprint.items() if role == "date" and col in df.columns]
        if not date_cols:
            return df
        
        print(f"📅 Decomposing Date features into ML-ready numeric columns: {date_cols}")
        
        pdf = df.to_pandas()
        for col in date_cols:
            pdf[col] = pd.to_datetime(pdf[col], errors='coerce')
            pdf[f"{col}_year"] = pdf[col].dt.year
            pdf[f"{col}_month"] = pdf[col].dt.month
            pdf[f"{col}_day"] = pdf[col].dt.day
            pdf[f"{col}_dayofweek"] = pdf[col].dt.dayofweek
            pdf = pdf.drop(columns=[col])
            
            blueprint["__date_decompositions__"].append(col)
            
        return pl.from_pandas(pdf)

    def _apply_one_hot_encoding(self, df: pl.DataFrame, target_col: str, blueprint: dict, auto_encode: bool, manual_cols: list) -> pl.DataFrame:
        # Respect manual string columns if auto_encode is disabled
        if auto_encode:
            string_cols = [
                col for col, dtype in df.schema.items() 
                if dtype == pl.Utf8 
                and col != target_col 
                and blueprint.get(col) not in ["date"]
            ]
        else:
            string_cols = [col for col in manual_cols if col in df.columns]
        
        if not string_cols:
            return df
            
        cols_to_encode = []
        cols_to_drop = []
        
        for col in string_cols:
            avg_len = df.select(pl.col(col).str.len_chars().mean()).item()
            if avg_len is not None and avg_len > 40:
                print(f"⏩ Skipping OHE for '{col}': Free-text detected.")
                cols_to_drop.append(col)
                continue
                
            non_null_count = df.height - df[col].null_count()
            if non_null_count > 10:
                unique_count = df[col].n_unique()
                if (unique_count / non_null_count) > 0.40:
                    print(f"🛡️ FAILSAFE: '{col}' high uniqueness. Purging.")
                    cols_to_drop.append(col)
                    continue

            unique_count = df[col].n_unique()
            if unique_count > 15:
                print(f"🗜️ High cardinality in '{col}'. Lumping into Top 15 + 'Other'.")
                top_15 = (
                    df.group_by(col)
                    .agg(pl.len().alias("count"))
                    .sort("count", descending=True)
                    .head(15)
                    .get_column(col)
                    .to_list()
                )
                df = df.with_columns(
                    pl.when(pl.col(col).is_in(top_15))
                    .then(pl.col(col))
                    .otherwise(pl.lit("Other"))
                    .alias(col)
                )
                blueprint["__ohe_mappings__"][col] = top_15
            else:
                categories = df.get_column(col).drop_nulls().unique().to_list()
                blueprint["__ohe_mappings__"][col] = categories

            cols_to_encode.append(col)
            
        if cols_to_drop:
            df = df.drop(cols_to_drop)
            blueprint["__engineered_dropped_columns__"].extend(cols_to_drop)

        if cols_to_encode:
            print(f"🔥 One-Hot Encoding refined categorical columns: {cols_to_encode}")
            # ---> THE FIX: Changed drop_first=True to drop_first=False <---
            df = df.to_dummies(columns=cols_to_encode, drop_first=False)
            
        return df

    def _apply_scaling(self, lazy_df: pl.LazyFrame, method: str, target_col: str, blueprint: dict) -> pl.LazyFrame:
        schema = lazy_df.collect_schema()
        numeric_cols = [
            col for col, dtype in schema.items() 
            if dtype in [pl.Int64, pl.Int32, pl.Float64, pl.Float32] 
            and col != target_col
        ]
        
        if not numeric_cols:
            return lazy_df

        print(f"📏 Applying '{method}' scaling to numerical features.")
        
        # Parallel Lazy Aggregation pass to compute scaling parameters
        agg_exprs = []
        if method == "standard":
            for col in numeric_cols:
                agg_exprs.append(pl.col(col).mean().alias(f"{col}_mean"))
                agg_exprs.append(pl.col(col).std().alias(f"{col}_std"))
        elif method == "minmax":
            for col in numeric_cols:
                agg_exprs.append(pl.col(col).min().alias(f"{col}_min"))
                agg_exprs.append(pl.col(col).max().alias(f"{col}_max"))

        scale_stats = lazy_df.select(agg_exprs).collect().to_dicts()[0]
        
        exprs = []
        scaling_blueprint = {"method": method, "params": {}}

        if method == "standard":
            for col in numeric_cols:
                mean_val = scale_stats.get(f"{col}_mean") or 0.0
                std_val = scale_stats.get(f"{col}_std") or 1.0
                if std_val == 0.0: std_val = 1.0
                
                scaling_blueprint["params"][col] = {"mean": mean_val, "std": std_val}
                exprs.append(((pl.col(col) - pl.lit(mean_val)) / pl.lit(std_val)).alias(col))

        elif method == "minmax":
            for col in numeric_cols:
                min_val = scale_stats.get(f"{col}_min") or 0.0
                max_val = scale_stats.get(f"{col}_max") or 1.0
                range_val = max_val - min_val
                if range_val == 0.0: range_val = 1.0
                
                scaling_blueprint["params"][col] = {"min": min_val, "max": max_val}
                exprs.append(((pl.col(col) - pl.lit(min_val)) / pl.lit(range_val)).alias(col))

        blueprint["__scaling_params__"] = scaling_blueprint

        if exprs:
            lazy_df = lazy_df.with_columns(exprs)
            
        return lazy_df