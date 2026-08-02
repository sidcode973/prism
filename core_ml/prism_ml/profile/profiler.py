import polars as pl
import chardet
import os
import s3fs
from prism_ml.exceptions import DataLoadError

class PrismProfiler:
    def __init__(self):
        print("🔍 Prism Profiler Initialized")
        
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
        """Returns the appropriate filesystem client."""
        if is_s3:
            return s3fs.S3FileSystem(
                client_kwargs={'endpoint_url': self.s3_endpoint},
                key=self.s3_key,
                secret=self.s3_secret
            )
        return None

    def generate_profile(self, file_path: str) -> str:
        """
        Attempts to scan the dataset. If the file is structurally corrupted (bad encodings, 
        mixed delimiters), it falls back to a raw text profile to force the LLM to use fix_csv.
        """
        print(f"👁️ Profiling dataset: {file_path}")
        is_s3 = file_path.startswith("s3://")
        
        try:
            # I/O Abstraction with quote_char shield
            read_kwargs = {
                "ignore_errors": True,
                "truncate_ragged_lines": True,
                "quote_char": None
            }

            # Decapitate Polars' S3 engine. Read bytes natively via s3fs.
            if is_s3:
                fs = self._get_filesystem(is_s3=True)
                with fs.open(file_path, 'rb') as f:
                    file_bytes = f.read()
                # Chain .lazy() to maintain compatibility with downstream stats_query
                lazy_df = pl.read_csv(file_bytes, **read_kwargs).lazy()
            else:
                lazy_df = pl.read_csv(file_path, **read_kwargs).lazy()
            
            schema = lazy_df.collect_schema()
            
            # Safely get row count, null counts, and unique counts mapping
            exprs = [pl.len().alias("total_rows")]
            for c in schema.names():
                exprs.append(pl.col(c).null_count().alias(f"{c}_nulls"))
                exprs.append(pl.col(c).n_unique().alias(f"{c}_unique"))
                
            stats_dict = lazy_df.select(exprs).collect().to_dicts()[0]
            total_rows = stats_dict["total_rows"]
            
            profile_lines = [f"Dataset Profile (Total Rows: {total_rows})"]

            for col_name in schema.names():
                dtype = str(schema[col_name])
                null_count = stats_dict[f"{col_name}_nulls"]
                unique_count = stats_dict[f"{col_name}_unique"]
                
                null_pct = round((null_count / total_rows) * 100, 1) if total_rows > 0 else 0
                unique_pct = round((unique_count / total_rows) * 100, 1) if total_rows > 0 else 0
                
                line = f"- Column: '{col_name}' | Type: {dtype} | Nulls: {null_pct}% | Uniqueness: {unique_pct}%"
                profile_lines.append(line)

            print("✅ Profile generated (Polars).")
            return "\n".join(profile_lines)

        except Exception as e:
            print(f"⚠️ Polars crashed reading file ({str(e)}). Switching to Raw Text Profiling.")
            
            # THE FALLBACK: Read raw bytes directly from MinIO Cloud
            try:
                raw_bytes = b""
                if is_s3:
                    fs = self._get_filesystem(is_s3=True)
                    with fs.open(file_path, 'rb') as f:
                        raw_bytes = f.read(10000)
                        
                    encoding = chardet.detect(raw_bytes)['encoding'] or 'utf-8'
                    
                    raw_lines = []
                    with fs.open(file_path, 'r', encoding=encoding, errors='replace') as f:
                        for i, line in enumerate(f):
                            if i >= 10: break
                            raw_lines.append(line.strip())
                else:
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