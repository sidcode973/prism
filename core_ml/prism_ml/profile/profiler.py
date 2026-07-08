import polars as pl
from prism_ml.exceptions import DataLoadError

class PrismProfiler:
    def __init__(self):
        print("🔍 Prism Profiler Initialized")

    def generate_profile(self, file_path: str) -> str:
        """
        Scans a dataset (LazyFrames) and returns a text-based schema profile for the LLM.
        """
        print(f"👁️ Profiling dataset: {file_path}")
        
        try:
            # LAZY EVALUATION: We use scan_csv instead of read_csv. 
            # This reads only the metadata headers, not the whole file.
            lazy_df = pl.scan_csv(file_path)
        except Exception as e:
            raise DataLoadError(file_path=file_path, message=str(e))

        # We can grab the schema instantly without loading the data
        schema = lazy_df.collect_schema()
        
        # To safely get the row count and null counts without an OOM crash, 
        # we build a highly optimized lazy query and collect just that 1 row of stats.
        stats_query = lazy_df.select([
            pl.len().alias("total_rows"),
            *[pl.col(c).null_count().alias(f"{c}_nulls") for c in schema.names()]
        ])
        
        # Execute the query efficiently
        stats = stats_query.collect().row(0)
        total_rows = stats[0]
        
        profile_lines = [f"Dataset Profile (Total Rows: {total_rows})"]

        # Loop through the columns and format the text for the LLM
        for idx, col_name in enumerate(schema.names()):
            dtype = str(schema[col_name])
            null_count = stats[idx + 1] # +1 because index 0 is total_rows
            null_pct = round((null_count / total_rows) * 100, 1) if total_rows > 0 else 0
            
            # Note: Unique counts are extremely memory intensive, so we omit them 
            # in the lazy profile to guarantee server safety on 5GB files.
            line = f"- Column: '{col_name}' | Type: {dtype} | Nulls: {null_pct}%"
            profile_lines.append(line)

        print("✅ Profile generated (Lazy).")
        return "\n".join(profile_lines)