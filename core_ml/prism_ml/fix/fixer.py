import os
import json
import uuid
import chardet
import csv
from typing import Dict, Any
from groq import Groq

class PrismFixer:
    def __init__(self):
        print("🛠️ Prism CSV Fixer Initialized")
        self.client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        self.model = "llama-3.3-70b-versatile"

    def execute_fix(self, node_id: str, file_path: str, parameters: Dict[str, Any]) -> str:
        print(f"🚑 Initiating Tier-1 Structural Repair on: {file_path}")
        
        with open(file_path, 'rb') as f:
            raw_bytes = f.read(10000)
            result = chardet.detect(raw_bytes)
            encoding = result['encoding'] or 'utf-8'
            
        raw_lines = []
        with open(file_path, 'r', encoding=encoding, errors='replace') as f:
            for i, line in enumerate(f):
                if i >= 15: break
                raw_lines.append(line)
            
        raw_text_sample = "".join(raw_lines)
        diagnosis = self._llm_diagnose_structure(raw_text_sample)
        print(f"🤖 LLM Structural Diagnosis: {diagnosis}")

        dataset_directory = os.path.dirname(file_path)
        run_id = uuid.uuid4().hex[:8]
        fixed_path = os.path.join(dataset_directory, f"structurally_fixed_{run_id}.csv")
        
        true_delimiter = diagnosis.get("true_delimiter", ",")
        bad_delimiters = diagnosis.get("bad_delimiters_to_replace", [])
        
        # Fallback to the header length if the LLM fails the count
        fixed_header = diagnosis.get("fixed_header_row", "")
        target_columns = diagnosis.get("intended_column_count", len(fixed_header.split(true_delimiter)) if fixed_header else 8)

        with open(file_path, 'r', encoding=encoding, errors='replace', newline='') as infile, \
             open(fixed_path, 'w', encoding='utf-8', newline='') as outfile:
            
            reader = csv.reader(infile, delimiter=true_delimiter, quotechar='"', escapechar='\\')
            
            # THE FIX: Force the output to ALWAYS be a standard comma-separated file
            writer = csv.writer(outfile, delimiter=',', quotechar='"', quoting=csv.QUOTE_MINIMAL)
            
            if diagnosis.get("header_is_corrupted") and fixed_header:
                writer.writerow([col.strip() for col in fixed_header.split(true_delimiter)])
                try:
                    next(infile, None) 
                except Exception:
                    pass
            
            for row in reader:
                # Skip rows that are completely empty or just contain empty commas
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
                
                # THE FIX: Pop all trailing empty strings caused by rogue commas at the end of rows
                while len(cleaned_row) > 0 and cleaned_row[-1] == "":
                    cleaned_row.pop()
                
                # Pad or truncate row to match exact target columns
                if len(cleaned_row) < target_columns:
                    cleaned_row.extend([""] * (target_columns - len(cleaned_row)))
                elif len(cleaned_row) > target_columns:
                    cleaned_row = cleaned_row[:target_columns]
                    
                writer.writerow(cleaned_row)

        print(f"🏥 Structural repair complete. Safe file saved at: {fixed_path}")
        return fixed_path

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
        except Exception as e:
            return {"true_delimiter": ",", "bad_delimiters_to_replace": ["|"], "header_is_corrupted": False, "intended_column_count": 8}