import os
import json
import chardet
import csv
import s3fs
from typing import Dict, Any, Tuple
from groq import Groq

class PrismFixer:
    def __init__(self):
        print("🛠️ Prism CSV Fixer Initialized")
        self.client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        self.model = "llama3-70b-8192" # Updated to a standard Groq model name
        
        # Cloud Authentication Credentials
        self.s3_endpoint = os.getenv("MINIO_ENDPOINT_URL", "http://127.0.0.1:9000")
        self.s3_key = os.getenv("MINIO_ACCESS_KEY", "prismadmin")
        self.s3_secret = os.getenv("MINIO_SECRET_KEY", "prismpassword")
        
    def _get_filesystem(self, is_s3: bool):
        """Returns the appropriate filesystem client (S3 or Local)."""
        if is_s3:
            return s3fs.S3FileSystem(
                client_kwargs={'endpoint_url': self.s3_endpoint},
                key=self.s3_key,
                secret=self.s3_secret
            )
        return None

    def execute_fix(self, node_id: str, file_path: str, parameters: Dict[str, Any], run_id: str) -> Tuple[str, dict]:
        print(f"🚑 Initiating Tier-1 Structural Repair on: {file_path}")
        
        is_s3 = file_path.startswith("s3://")
        fs = self._get_filesystem(is_s3)
        open_func = fs.open if is_s3 else open
        
        # 1. Detect Encoding securely
        with open_func(file_path, 'rb') as f:
            raw_bytes = f.read(10000)
            result = chardet.detect(raw_bytes)
            encoding = result['encoding'] or 'utf-8'
            
        # ==========================================
        # MANUAL OVERRIDE VS. AI DIAGNOSIS
        # ==========================================
        # If the user explicitly defined structural rules in the UI, use them.
        # Otherwise, fall back to the LLM for autonomous diagnosis.
        if parameters and "true_delimiter" in parameters:
            print("👤 Manual structural parameters detected. Bypassing LLM diagnosis.")
            diagnosis = parameters
        else:
            raw_lines = []
            with open_func(file_path, 'r', encoding=encoding, errors='replace') as f:
                for i, line in enumerate(f):
                    if i >= 15: break
                    raw_lines.append(line)
                
            raw_text_sample = "".join(raw_lines)
            diagnosis = self._llm_diagnose_structure(raw_text_sample)
            print(f"🤖 LLM Structural Diagnosis: {diagnosis}")

        # 3. Generate Cloud or Local Output Path using the MASTER run_id
        if is_s3:
            directory = os.path.dirname(file_path)
            fixed_path = f"{directory}/structurally_fixed_{run_id}.csv"
        else:
            dataset_directory = os.path.dirname(file_path)
            fixed_path = os.path.join(dataset_directory, f"structurally_fixed_{run_id}.csv")
        
        true_delimiter = diagnosis.get("true_delimiter", ",")
        bad_delimiters = diagnosis.get("bad_delimiters_to_replace", [])
        fixed_header = diagnosis.get("fixed_header_row", "")
        
        target_columns = diagnosis.get("intended_column_count")
        if not target_columns:
             target_columns = len(fixed_header.split(true_delimiter)) if fixed_header else 8

        # Record the exact structural blueprint for deployment
        structural_blueprint = {
            "__structural_repair__": {
                "true_delimiter": true_delimiter,
                "bad_delimiters_replaced": bad_delimiters,
                "target_column_count": target_columns,
                "header_injected": bool(diagnosis.get("header_is_corrupted") and fixed_header)
            }
        }

        # 4. Stream, Repair, and Write
        with open_func(file_path, 'r', encoding=encoding, errors='replace', newline='') as infile, \
             open_func(fixed_path, 'w', encoding='utf-8', newline='') as outfile:
            
            reader = csv.reader(infile, delimiter=true_delimiter, quotechar='"', escapechar='\\')
            writer = csv.writer(outfile, delimiter=',', quotechar='"', quoting=csv.QUOTE_MINIMAL)
            
            if diagnosis.get("header_is_corrupted") and fixed_header:
                writer.writerow([col.strip() for col in fixed_header.split(true_delimiter)])
                try:
                    next(infile, None) 
                except Exception:
                    pass
            
            # ---> THE HOLY RELIC: UNTOUCHED CLEANING LOGIC <---
            for row in reader:
                if not row or all(str(cell).strip() == "" for cell in row):
                    continue 
                    
                cleaned_row = []
                for item in row:
                    was_split = False
                    if bad_delimiters:
                        for bad_delim in bad_delimiters:
                            if bad_delim in item:
                                sub_items = item.split(bad_delim)
                                cleaned_row.extend([sub.strip() for sub in sub_items])
                                was_split = True
                                break
                    if not was_split:
                        cleaned_row.append(item.strip())
                
                while len(cleaned_row) > 0 and cleaned_row[-1] == "":
                    cleaned_row.pop()
                
                if len(cleaned_row) < target_columns:
                    cleaned_row.extend([""] * (target_columns - len(cleaned_row)))
                elif len(cleaned_row) > target_columns:
                    cleaned_row = cleaned_row[:target_columns]
                    
                writer.writerow(cleaned_row)

        print(f"🏥 Structural repair complete. Safe file saved at: {fixed_path}")
        return fixed_path, structural_blueprint

    def _llm_diagnose_structure(self, raw_text: str) -> Dict[str, Any]:
        system_prompt = """
        You are a Master Data Engineer. Analyze this corrupted tabular text file.
        Look for missing delimiters in the header, mixed delimiters, and varying row lengths.
        
        CRITICAL: Identify any rogue delimiters (like '|', ';', or '\\t') that are mixing with the true delimiter.
        Count the logical number of columns based on the header.
        
        You MUST output ONLY valid JSON. Use this exact format, but replace the values with your actual analysis:
        {
            "true_delimiter": ",", 
            "bad_delimiters_to_replace": ["|"],
            "intended_column_count": 8,
            "header_is_corrupted": true,
            "fixed_header_row": "Column1,Column2,Column3,Column4,Column5,Column6,Column7,Column8"
        }
        """
        try:
            response = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"RAW TEXT SAMPLE:\n{raw_text}"}
                ],
                model=self.model,
                response_format={"type": "json_object"}, 
                temperature=0.0
            )
            return json.loads(response.choices[0].message.content)
        except Exception:
            return {"true_delimiter": ",", "bad_delimiters_to_replace": ["|"], "header_is_corrupted": False, "intended_column_count": 8}