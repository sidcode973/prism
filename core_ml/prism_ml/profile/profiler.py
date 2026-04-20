import polars as pl
from prism_ml.exceptions import DataLoadError

class PrismProfiler:
    def __init__(self):
        print("🔍 Prism Profiler Initialized")

    def generate_profile(self, file_path: str) -> str:
        """
        Scans a dataset and returns a text-based schema profile for the LLM.
        """
        print(f"👁️ Profiling dataset: {file_path}")
        
        try:
            df = pl.read_csv(file_path)
        except Exception as e:
            raise DataLoadError(file_path=file_path, message=str(e))

        total_rows = df.height
        profile_lines = [f"Dataset Profile (Total Rows: {total_rows})"]

        for col_name in df.columns:
            dtype = str(df[col_name].dtype)
            null_count = df[col_name].null_count()
            null_pct = round((null_count / total_rows) * 100, 1) if total_rows > 0 else 0
            unique_count = df[col_name].n_unique()
            
            # This is the exact string the AI will read to make its decisions
            line = f"- Column: '{col_name}' | Type: {dtype} | Nulls: {null_pct}% | Unique Values: {unique_count}"
            profile_lines.append(line)

        print("✅ Profile generated.")
        return "\n".join(profile_lines)