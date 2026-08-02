import polars as pl
from typing import Dict, Any
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

    def execute_engineering(self, node_id: str, file_path: str, parameters: Dict[str, Any]) -> tuple[pl.DataFrame, str]:
        print(f"📥 Loading dataset for feature engineering from: {file_path}")
        
        is_s3 = file_path.startswith("s3://")
        
        try:
            # I/O Abstraction for Reading
            read_kwargs = {"ignore_errors": True}
            
            # Decapitate Polars' S3 engine. Read bytes natively via s3fs.
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

        # Safely extract the exact target column, ignoring LLM hallucinated spaces
        target_col = parameters.get("target_column")
        if target_col:
            target_col = target_col.strip()
            for col in df.columns:
                if col.strip().lower() == target_col.lower():
                    target_col = col
                    break

        column_roles = parameters.get("column_roles", {})
        exclude_cols = parameters.get("exclude_columns", [])

        # ==========================================
        # 1. THE PRE-EMPTIVE PURGE
        # Moved to Step 1: Guarantees raw text, IDs, and excluded columns 
        # never make it into the downstream math engines.
        # ==========================================
        cols_to_drop = []
        for col in df.columns:
            if (column_roles.get(col) == "identifier" or col in exclude_cols) and col != target_col:
                cols_to_drop.append(col)
                
        if cols_to_drop:
            print(f"🗑️ Purging non-predictive columns from ML Matrix: {cols_to_drop}")
            df = df.drop(cols_to_drop, strict=False)

        # 2. DECOMPOSE DATES (Convert strings to actionable ML numeric features)
        df = self._decompose_dates(df, column_roles)

        # 3. ENCODE CATEGORICALS (One-Hot Encoding, strictly bypassing identifiers)
        if parameters.get("encode_categoricals", True):
            df = self._apply_one_hot_encoding(df, target_col, column_roles)

        # Convert to LazyFrame for mathematical scaling
        lazy_df = df.lazy()

        # 4. FEATURE SCALING
        scale_method = parameters.get("scale_method", "none").lower()
        if scale_method in ["standard", "minmax"]:
            lazy_df = self._apply_scaling(lazy_df, scale_method, target_col, column_roles)

        print("⚙️ Executing Feature Engineering Math via Polars Streaming...")
        try:
            engineered_df = lazy_df.collect(streaming=True)
            
            # THE PROFESSIONAL APPROACH: Data Schema Governance
            # Clean all column names to be strictly alphanumeric + underscores to prevent ML engine crashes
            safe_columns = [re.sub(r'[^a-zA-Z0-9_]', '_', col) for col in engineered_df.columns]
            engineered_df = engineered_df.rename(dict(zip(engineered_df.columns, safe_columns)))
            
            print(f"✅ Feature Engineering complete. Final ML Matrix shape: {engineered_df.shape}")
            
            # I/O Abstraction for Writing
            run_id = uuid.uuid4().hex[:8]
            
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
            return engineered_df, save_path
            
        except Exception as e:
            raise ValueError(f"Node {node_id}: Engineering execution failed: {e}")

    # ==========================================
    # MATHEMATICAL TRANSFORMERS
    # ==========================================

    def _decompose_dates(self, df: pl.DataFrame, column_roles: dict) -> pl.DataFrame:
        """Professionally breaks Date columns into Year/Month/Day numeric features."""
        date_cols = [col for col, role in column_roles.items() if role == "date" and col in df.columns]
        if not date_cols:
            return df
        
        print(f"📅 Decomposing Date features into ML-ready numeric columns: {date_cols}")
        
        # Pandas `to_datetime` is industry-standard for fuzzy format inference
        pdf = df.to_pandas()
        for col in date_cols:
            pdf[col] = pd.to_datetime(pdf[col], errors='coerce')
            pdf[f"{col}_year"] = pdf[col].dt.year
            pdf[f"{col}_month"] = pdf[col].dt.month
            pdf[f"{col}_day"] = pdf[col].dt.day
            pdf[f"{col}_dayofweek"] = pdf[col].dt.dayofweek
            pdf = pdf.drop(columns=[col]) # Drop the original datetime object
            
        return pl.from_pandas(pdf)

    def _apply_one_hot_encoding(self, df: pl.DataFrame, target_col: str, column_roles: dict) -> pl.DataFrame:
        """Finds string columns, applies Smart OHE (skips identifiers, free-text, lumps high cardinality)."""
        # Strictly ignore target column AND detected dates (Identifiers are already purged)
        string_cols = [
            col for col, dtype in df.schema.items() 
            if dtype == pl.Utf8 
            and col != target_col 
            and column_roles.get(col) not in ["date"]
        ]
        
        if not string_cols:
            return df
            
        cols_to_encode = []
        cols_to_drop = []
        
        for col in string_cols:
            # 1. Free-Text Detection: Skip if average string length is > 40 characters
            avg_len = df.select(pl.col(col).str.len_chars().mean()).item()
            if avg_len is not None and avg_len > 40:
                print(f"⏩ Skipping OHE for '{col}': Detected as free-text (Avg length {avg_len:.1f}).")
                cols_to_drop.append(col)
                continue
                
            # 2. THE MATRIX SHIELD: Fallback Uniqueness Check
            # If > 40% of the column is unique, it's an uncaught ID/Name. Drop it to prevent OHE explosion.
            non_null_count = df.height - df[col].null_count()
            if non_null_count > 10:
                unique_count = df[col].n_unique()
                if (unique_count / non_null_count) > 0.40:
                    print(f"🛡️ FAILSAFE: '{col}' has {unique_count/non_null_count:.1%} uniqueness. Purging to prevent Matrix explosion.")
                    cols_to_drop.append(col)
                    continue

            # 3. Top-K Lumping for High Cardinality (Safe categories with < 40% uniqueness)
            unique_count = df[col].n_unique()
            if unique_count > 15:
                print(f"🗜️ High cardinality in '{col}' ({unique_count} unique). Lumping into Top 15 + 'Other'.")
                
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
            
            cols_to_encode.append(col)
            
        if cols_to_drop:
            df = df.drop(cols_to_drop)

        if cols_to_encode:
            print(f"🔥 One-Hot Encoding refined categorical columns: {cols_to_encode}")
            # drop_first=True prevents the Dummy Variable Trap (Multicollinearity)
            df = df.to_dummies(columns=cols_to_encode, drop_first=True)
            
        return df

    def _apply_scaling(self, lazy_df: pl.LazyFrame, method: str, target_col: str, column_roles: dict) -> pl.LazyFrame:
        """Applies Standard (Z-score) or Min-Max scaling to numerical features."""
        schema = lazy_df.collect_schema()
        
        # Identifiers and Excludes are already purged, so we just grab math columns
        numeric_cols = [
            col for col, dtype in schema.items() 
            if dtype in [pl.Int64, pl.Int32, pl.Float64, pl.Float32] 
            and col != target_col
        ]
        
        if not numeric_cols:
            return lazy_df

        print(f"📏 Applying '{method}' scaling to numerical features.")
        exprs = []
        
        if method == "standard":
            for col in numeric_cols:
                exprs.append(
                    ((pl.col(col) - pl.col(col).mean()) / pl.col(col).std()).alias(col)
                )
        elif method == "minmax":
            for col in numeric_cols:
                exprs.append(
                    ((pl.col(col) - pl.col(col).min()) / (pl.col(col).max() - pl.col(col).min())).alias(col)
                )

        if exprs:
            lazy_df = lazy_df.with_columns(exprs)
            
        return lazy_df