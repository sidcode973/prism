import polars as pl
from typing import Dict, Any
from prism_ml.exceptions import DataLoadError, CleaningConfigurationError
import os
import uuid
class PrismCleaner:
    def __init__(self):
        print("🔧 Prism Cleaner Initialized")

    def execute_cleaning(self, node_id: str, file_path: str, parameters: Dict[str, Any]) -> pl.DataFrame:
        """
        The Orchestrator method. It builds a LazyFrame query plan by chaining modular steps.
        """
        print(f"📥 Scanning dataset lazily from: {file_path}")
        
        try:
           lazy_df = pl.scan_csv(
                file_path,
                null_values=["NA", "N/A", "null", "NaN", "?", "", " "]
            )
        except Exception as e:
            raise DataLoadError(file_path=file_path, message=str(e))

        if not parameters:
            raise CleaningConfigurationError(node_id=node_id, message="Parameters cannot be empty.")

        # Chain the modular query builders
        lazy_df = self._apply_deduplication(lazy_df, parameters.get("remove_duplicates", False))
        lazy_df = self._apply_drops(lazy_df, parameters.get("drop_columns", []))
        lazy_df = self._apply_imputations(lazy_df, parameters.get("impute_rules", {}))

        # Execute the final massive query plan efficiently via Streaming
        print("⚙️ Executing Lazy Query Plan via Polars Streaming Engine...")
        try:
            cleaned_df = lazy_df.collect(streaming=True)
            print(f"✅ Data cleaning complete. Final shape: {cleaned_df.shape}")
            dataset_directory = os.path.dirname(file_path)
            run_id = uuid.uuid4().hex[:8]
            save_path = os.path.join(dataset_directory, f"cleaned_dataset_{run_id}.csv")
            cleaned_df.write_csv(save_path)
            print(f"💾 Cleaned dataset securely saved to disk at: {save_path}")
            return cleaned_df,save_path
        except Exception as e:
            raise CleaningConfigurationError(node_id=node_id, message=f"Streaming execution failed: {e}")

    # ==========================================
    # MODULAR QUERY BUILDERS (The Architecture)
    # ==========================================

    def _apply_deduplication(self, lazy_df: pl.LazyFrame, remove_dupes: bool) -> pl.LazyFrame:
        if remove_dupes:
            print("🧹 Plan updated: Drop exact duplicate rows.")
            return lazy_df.unique()
        return lazy_df

    def _apply_drops(self, lazy_df: pl.LazyFrame, drop_cols: list) -> pl.LazyFrame:
        if drop_cols:
            print(f"🗑️ Plan updated: Drop columns {drop_cols}.")
            # strict:False is used so that it does not give error if such column does not exist in lazy_df schema
            return lazy_df.drop(drop_cols, strict=False) 
        return lazy_df

    def _apply_imputations(self, lazy_df: pl.LazyFrame, impute_rules: Dict[str, str]) -> pl.LazyFrame:
        if not impute_rules:
            return lazy_df

        print(f"🩹 Plan updated: Applying specific imputation rules: {impute_rules}")
        
        # TYPE-SAFE ARMOR: Fetch schema to verify column types before applying AI rules
        schema = lazy_df.collect_schema()
        exprs = []
        
        for col_name, strategy in impute_rules.items():
            if col_name not in schema.names():
                continue # Skip if AI hallucinated a column name
                
            dtype = schema[col_name]
            is_numeric = dtype in [pl.Int64, pl.Int32, pl.Float64, pl.Float32]
            is_string = dtype == pl.Utf8

            # Route based on AI strategy AND physical data type
            if strategy == "skip":
                print(f"⏭️ AI skipped imputation for '{col_name}'.")
                continue
            elif strategy == "median" and is_numeric:
                exprs.append(pl.col(col_name).fill_null(pl.col(col_name).median()))
            elif strategy == "mean" and is_numeric:
                exprs.append(pl.col(col_name).fill_null(pl.col(col_name).mean()))
            elif strategy == "mode":
                exprs.append(pl.col(col_name).fill_null(pl.col(col_name).mode().first()))
            elif strategy == "constant_unknown" and is_string:
                # Also strip weird whitespace as a bonus cleaning step
                exprs.append(pl.col(col_name).str.strip_chars().fill_null("Unknown"))
            else:
                print(f"⚠️ Blocked Illegal AI Move: Attempted to apply '{strategy}' to '{col_name}' (Type: {dtype}).")

        # Apply all math formulas in one highly optimized parallel pass
        if exprs:
            lazy_df = lazy_df.with_columns(exprs)
            
        return lazy_df