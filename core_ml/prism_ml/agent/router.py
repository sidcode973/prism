import os
import json
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, ValidationError, model_validator
from groq import Groq
from dotenv import load_dotenv
import time

load_dotenv()

# ==========================================
# 1. PYDANTIC MODELS
# ==========================================

class Metadata(BaseModel):
    user_id: str
    project_id: str
    tier: str = "free"
    max_time_budget_seconds: int = 300

class Dataset(BaseModel):
    file_name: str
    minio_path: str

class Node(BaseModel):
    node_id: str
    action_type: str
    parameters: Dict[str, Any]

class PipelineContract(BaseModel):
    metadata: Metadata
    dataset: Dataset
    nodes: List[Node]
    execution_order: List[str]

    @model_validator(mode='after')
    def verify_execution_graph(self):
        defined_node_ids = [node.node_id for node in self.nodes]
        
        if len(defined_node_ids) != len(set(defined_node_ids)):
            from collections import Counter
            duplicates = [id for id, count in Counter(defined_node_ids).items() if count > 1]
            raise ValueError(f"Graph Error: Duplicate node IDs: {duplicates}.")

        if len(self.execution_order) != len(set(self.execution_order)):
            raise ValueError("Graph Error: 'execution_order' contains duplicate steps.")

        for step_id in self.execution_order:
            if step_id not in defined_node_ids:
                raise ValueError(f"Graph Error: execution_order asked to run '{step_id}', but node not defined.")

        for node_id in defined_node_ids:
            if node_id not in self.execution_order:
                raise ValueError(f"Graph Error: Node '{node_id}' missing from execution_order.")

        action_order = [next(n.action_type for n in self.nodes if n.node_id == step_id) for step_id in self.execution_order]
        
        # Updated Domain Logic Checks for the 3-Node Architecture
        if "train_model" in action_order:
            if "feature_engineer" not in action_order:
                raise ValueError("Graph Error: Cannot 'train_model' without a 'feature_engineer' node preceding it.")
            if action_order.index("feature_engineer") > action_order.index("train_model"):
                raise ValueError("Graph Error: 'feature_engineer' must logically occur BEFORE 'train_model'.")
                
        if "feature_engineer" in action_order and "clean_data" in action_order:
             if action_order.index("clean_data") > action_order.index("feature_engineer"):
                raise ValueError("Graph Error: 'clean_data' must logically occur BEFORE 'feature_engineer'.")

        return self

# --- NEW: THE ABORT SWITCH ---
class RouterResponse(BaseModel):
    status: str # Must be "success" or "error"
    rejection_reason: Optional[str] = None
    pipeline: Optional[PipelineContract] = None

# ==========================================
# 2. THE AGENT CLASS
# ==========================================

class PrismRouterAgent:
    def __init__(self):
        # NOTE: If using an actual OpenAI model, ensure you are hitting the right Base URL 
        # or switch to the official OpenAI Python SDK.
        self.client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        self.model = "openai/gpt-oss-120b" 

    def generate_contract(self, user_prompt: str, user_id: str, project_id: str, file_name: str, data_profile: str) -> str:
        # THE FIX: Syncing the bucket name to 'prism-datasets'
        system_prompt = f"""
        You are the Master Data Engineering Agent for Project Prism. Your job is to translate user requests into a strict JSON pipeline contract OR reject illogical requests.
        
        The dataset is: {file_name}
        
        --- DATA SCHEMA PROFILE ---
        Analyze this profile to make autonomous decisions regarding target columns and data relationships:
        {data_profile}
        
        --- PIPELINE RULES ---
        You have 5 Node Types available. You must chain them logically.
        
        1. "fix_csv": Use if the data profile looks structurally broken (ragged lines, missing headers, bad delimiters).
           - Params: {{"run_structural_repair": true}}
           
        2. "clean_data": Use to impute nulls, force numeric types, and drop ID columns.
           - Params: 
             "auto_purge": true 
             "coerce_types": true 
             "remove_duplicates": true
             "drop_columns": [] 
             "impute_rules": {{"ColName": "median"|"mean"|"mode"|"constant_unknown"|"skip"}}

        3. "feature_engineer": Use ONLY to mathematically prep data for ML Algorithms. DO NOT USE FOR PLOTTING. DO NOT PASS DATE RELATED COLUMNS TO THIS NODE!
           - Params:
             "target_column": "ColumnName" 
             "scale_method": "standard" or "minmax" or "none"
             "encode_categoricals": true 

        4. "generate_plot": Use to create visualizations. 
           - Params MUST ALWAYS include the specific columns to plot based on the schema profile.
           - Params: 
             "chart_type": "scatter"|"bar"|"histogram"|"boxplot"|"heatmap"
             "x_col": "ExactColumnNameFromSchema" (Required for all except heatmap)
             "y_col": "ExactColumnNameFromSchema" (Required for scatter, bar, boxplot)
             "title": "A descriptive title for the chart"

        5. "train_model": Use to train ML models.

        --- AUTONOMY, GRAPH SELECTION & ABORT RULES ---
        - ML AUTONOMY: If the user asks to train a model, you MUST inject `fix_csv` -> `clean_data` -> `feature_engineer` before the `train_model` node.
        - PLOT AUTONOMY: If the user asks to plot graphs, you MUST inject `fix_csv` -> `clean_data` before the `generate_plot` nodes. YOU MUST NOT INJECT `feature_engineer`. 
        - ANALYTICAL GRAPH SELECTION: If the user broadly asks to "plot graphs" without specifying columns, act as a Data Scientist. Look at the Schema Profile and choose logical pairs. DO NOT leave `x_col` or `y_col` blank.
        - ABORT SWITCH: If the user explicitly forbids cleaning, but requests a model on dirty data, REJECT the request. Set status to "error" and provide a "rejection_reason".

        You must output ONLY valid JSON matching this exact structure:
        {{
            "status": "success",
            "rejection_reason": null,
            "pipeline": {{
                "metadata": {{"user_id": "{user_id}", "project_id": "{project_id}"}},
                "dataset": {{"file_name": "{file_name}", "minio_path": "s3://prism-datasets/{user_id}/{file_name}"}},
                "nodes": [
                    {{"node_id": "fix_1", "action_type": "fix_csv", "parameters": {{"run_structural_repair": true}}}},
                    {{"node_id": "clean_1", "action_type": "clean_data", "parameters": {{"auto_purge": true, "coerce_types": true, "remove_duplicates": true, "drop_columns": [], "impute_rules": {{}}}}}},
                    {{"node_id": "plot_1", "action_type": "generate_plot", "parameters": {{"chart_type": "scatter", "x_col": "Age", "y_col": "Salary", "title": "Age vs Salary"}}}}
                ],
                "execution_order": ["fix_1", "clean_1", "plot_1"]
            }}
        }}
        """
        for attempt in range(3):
            try:
                response = self.client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    model=self.model,
                    response_format={"type": "json_object"}, 
                    temperature=0.1 
                )

                raw_json = response.choices[0].message.content
                parsed_data = json.loads(raw_json)

                # ==========================================
                # THE BULLETPROOF INJECTION SHIELD
                # ==========================================
                if parsed_data.get("status") == "success" and parsed_data.get("pipeline"):
                    if "dataset" not in parsed_data["pipeline"]:
                        parsed_data["pipeline"]["dataset"] = {}
                    
                    parsed_data["pipeline"]["dataset"]["file_name"] = file_name
                    # THE FIX: Syncing the bucket name to 'prism-datasets'
                    parsed_data["pipeline"]["dataset"]["minio_path"] = f"s3://prism-datasets/{user_id}/{file_name}"
                    
                    if "metadata" not in parsed_data["pipeline"]:
                        parsed_data["pipeline"]["metadata"] = {}
                        
                    parsed_data["pipeline"]["metadata"]["user_id"] = user_id
                    parsed_data["pipeline"]["metadata"]["project_id"] = project_id
                # ==========================================

                validated_response = RouterResponse(**parsed_data)
                
                return validated_response.model_dump_json(indent=2)

            except ValidationError as e:
                print(f"⚠️ Attempt {attempt + 1}: LLM hallucinated bad JSON. Retrying...")
                if attempt == 2:
                    raise ValueError(f"LLM repeatedly generated invalid structure. Details: {e}")
                time.sleep(2)
                
            except Exception as e:
                print(f"⚠️ Attempt {attempt + 1}: API error. Retrying...")
                if attempt == 2:
                    raise ConnectionError(f"API failed after 3 retries: {e}")
                time.sleep(2)