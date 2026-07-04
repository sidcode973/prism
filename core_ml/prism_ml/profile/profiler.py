import polars as pl
import chardet
from prism_ml.exceptions import DataLoadError

class PrismProfiler:
    def __init__(self):
        print("🔍 Prism Profiler Initialized")

    def generate_profile(self, file_path: str) -> str:
        """
        Attempts to scan the dataset. If the file is structurally corrupted (bad encodings, 
        mixed delimiters), it falls back to a raw text profile to force the LLM to use fix_csv.
        """
        print(f"👁️ Profiling dataset: {file_path}")
        
        try:
            # Attempt to scan normally with safety guards
            lazy_df = pl.scan_csv(
                file_path, 
                ignore_errors=True, 
                truncate_ragged_lines=True
            )
            
            schema = lazy_df.collect_schema()
            
            # Safely get row count and null counts
            stats_query = lazy_df.select([
                pl.len().alias("total_rows"),
                *[pl.col(c).null_count().alias(f"{c}_nulls") for c in schema.names()]
            ])
            
            stats = stats_query.collect().row(0)
            total_rows = stats[0]
            
            profile_lines = [f"Dataset Profile (Total Rows: {total_rows})"]

            for idx, col_name in enumerate(schema.names()):
                dtype = str(schema[col_name])
                null_count = stats[idx + 1] 
                null_pct = round((null_count / total_rows) * 100, 1) if total_rows > 0 else 0
                
                line = f"- Column: '{col_name}' | Type: {dtype} | Nulls: {null_pct}%"
                profile_lines.append(line)

            print("✅ Profile generated (Polars).")
            return "\n".join(profile_lines)

        except Exception as e:
            print(f"⚠️ Polars crashed reading file ({str(e)}). Switching to Raw Text Profiling.")
            
            # THE FALLBACK: The file is structurally broken. Read it as raw bytes.
      # THE FALLBACK: The file is structurally broken. Read it as raw bytes.
            try:
                with open(file_path, 'rb') as f:
                    raw_bytes = f.read(10000)
                    encoding = chardet.detect(raw_bytes)['encoding'] or 'utf-8'
                    
                raw_lines = []
                with open(file_path, 'r', encoding=encoding, errors='replace') as f:
                    for i, line in enumerate(f):
                        if i >= 10: break
                        raw_lines.append(line.strip())
                    
                profile_lines = [
                    "CRITICAL STRUCTURAL ERROR: This file could not be parsed by standard engines.",
                    "It contains invalid encodings, ragged lines, or mixed delimiters.",
                    "You MUST autonomously inject a 'fix_csv' node to repair this before doing anything else.",
                    "\n--- RAW TEXT SAMPLE (First 10 Lines) ---"
                ]
                profile_lines.extend(raw_lines)
                
                print("✅ Profile generated (Raw Text Fallback).")
                return "\n".join(profile_lines)
                
            except Exception as fallback_e:
                raise DataLoadError(file_path=file_path, message=f"Fatal read error: {str(fallback_e)}")