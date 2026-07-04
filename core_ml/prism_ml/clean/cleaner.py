import polars as pl
from typing import Dict, Any
from prism_ml.exceptions import DataLoadError, CleaningConfigurationError
import os
import uuid

class PrismCleaner:
    def __init__(self):
        print("🧹 Semantic Prism Cleaner Initialized")

    def execute_cleaning(self, node_id: str, file_path: str, parameters: Dict[str, Any]) -> tuple[pl.DataFrame, str]:
        print(f"📥 Loading structurally sound dataset from: {file_path}")
        
        try:
            df = pl.read_csv(
                file_path,
                separator=",",
                null_values=["NA", "N/A", "null", "NaN", "?", "", " ", "-", "unknown", "Unknown"],
                ignore_errors=True,
                # THE FIX: Removed quote_char=None so "? 55,000" stays as one single column
                truncate_ragged_lines=True 
            )
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
            
            dataset_directory = os.path.dirname(file_path)
            run_id = uuid.uuid4().hex[:8]
            save_path = os.path.join(dataset_directory, f"cleaned_dataset_{run_id}.csv")
            cleaned_df.write_csv(save_path)
            
            print(f"💾 Cleaned dataset safely handed off to disk at: {save_path}")
            return cleaned_df, save_path
            
        except Exception as e:
            raise CleaningConfigurationError(node_id=node_id, message=f"Streaming execution failed: {e}")

    # ==========================================
    # MODULAR QUERY BUILDERS
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
        """Explicitly drops shifted rows where ID and Name fields bleed together (e.g., Davis == Davis)."""
        if len(df.columns) >= 2:
            col0 = df.columns[0]
            col1 = df.columns[1]
            
            # Mask to find rows where Column 1 equals Column 2 and is not empty
            mask = (df[col0] == df[col1]) & (df[col0].is_not_null()) & (df[col0].str.strip_chars() != "")
            
            shifted_count = mask.sum()
            if shifted_count > 0:
                print(f"🚨 Semantic Bouncer: Dropped {shifted_count} critically shifted rows (Detected '{col0}' == '{col1}')")
                df = df.filter(~mask)
                
        return df

    def _apply_smart_coercion(self, lazy_df: pl.LazyFrame) -> pl.LazyFrame:
        df = lazy_df.collect()
        
        for col in df.columns:
            if df[col].dtype == pl.Utf8:
                # Target currency symbols, spaces, and edge cases
                numeric_cleaning = df.get_column(col).str.replace_all(r"[$,%\"'?Ł£€ ]", "")
                casted_numbers = numeric_cleaning.cast(pl.Float64, strict=False)
                
                original_nulls = df.get_column(col).null_count()
                new_nulls = casted_numbers.null_count()
                
                # THE FIX: If at least 50% of the available data converts to a number, FORCE IT NUMERIC.
                # This ensures the ID and Payments columns aren't held hostage by a few bad string rows.
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
        
        # THE FIX: Global ML Imputation. Do not rely solely on the LLM to map every column.
        for col_name, dtype in schema.items():
            is_numeric = dtype in [pl.Int64, pl.Int32, pl.Float64, pl.Float32]
            is_string = dtype == pl.Utf8
            
            # Check if LLM gave a rule, otherwise default to a safe ML approach
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