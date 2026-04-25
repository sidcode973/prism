# This file is for converting natural language prompts into a strict JSON format that our backend & frontend can understand.
import os
import json
from typing import List, Dict, Any
from pydantic import BaseModel, ValidationError, model_validator
from groq import Groq
from dotenv import load_dotenv
import time

# Load your Groq API key from the .env file
load_dotenv()

# ==========================================
# 1. PYDANTIC MODELS (The Enforcers)
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
        """Exhaustively proves the DAG is mathematically valid and logically sound."""
        defined_node_ids = [node.node_id for node in self.nodes]
        
        # --- 1. UNIQUE NODE CHECK (No Clones) ---
        if len(defined_node_ids) != len(set(defined_node_ids)):
            from collections import Counter
            duplicates = [id for id, count in Counter(defined_node_ids).items() if count > 1]
            raise ValueError(f"Graph Error: Duplicate node IDs generated: {duplicates}. Node IDs must be unique.")

        # --- 2. UNIQUE EXECUTION CHECK (No Loops) ---
        if len(self.execution_order) != len(set(self.execution_order)):
            raise ValueError("Graph Error: 'execution_order' contains duplicate steps. Infinite loops are strictly forbidden.")

        # --- 3. GHOST CHECK (Execution without Definition) ---
        for step_id in self.execution_order:
            if step_id not in defined_node_ids:
                raise ValueError(f"Graph Error: 'execution_order' asked to run '{step_id}', but that node was never defined.")

        # --- 4. ORPHAN CHECK (Definition without Execution) ---
        for node_id in defined_node_ids:
            if node_id not in self.execution_order:
                raise ValueError(f"Graph Error: Node '{node_id}' was defined in 'nodes' but is missing from 'execution_order'.")

        # --- 5. DOMAIN LOGIC CHECK (Clean before Train) ---
        action_order = [next(n.action_type for n in self.nodes if n.node_id == step_id) for step_id in self.execution_order]
        
        if "train_model" in action_order and "clean_data" in action_order:
            if action_order.index("clean_data") > action_order.index("train_model"):
                raise ValueError("Graph Error: 'clean_data' must logically occur BEFORE 'train_model' in the execution order.")

        return self

# ==========================================
# 2. THE GROQ AGENT CLASS
# ==========================================

class PrismRouterAgent:
    def __init__(self):
        # Initialize the connection to the massive 70B model
        self.client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        self.model = "llama-3.3-70b-versatile"

    def generate_contract(self, user_prompt: str, user_id: str, project_id: str, file_name: str, data_profile: str) -> str:
        """
        Takes a human prompt AND a data profile, returning a validated JSON string.
        """
        system_prompt = f"""
        You are the Master Agent for Project Prism. Your job is to translate user requests into a strict JSON pipeline contract.
        
        The user is: {user_id}
        The dataset is: {file_name}
        The minio_path should always be: s3://prism-data/{user_id}/{file_name}
        
        --- DATA SCHEMA PROFILE ---
        You must analyze this profile to make autonomous decisions:
        {data_profile}
        
        RULES FOR CLEANING:
        1. "drop_columns": Automatically list columns that are useless for ML (IDs, Names, 100% unique strings).
        2. "remove_duplicates": Set to true to drop identical rows.
        3. "impute_rules": You MUST act as a Senior Data Scientist. Analyze the profile and create a dictionary where the key is the column name with nulls, and the value is the specific strategy.
           - Use "median" for skewed numeric data.
           - Use "mean" for normally distributed numeric data.
           - Use "mode" for categorical/string data with a clear majority.
           - Use "constant_unknown" for categorical strings where the mode is unclear.
           - Use "skip" if you do not understand the column or if imputing would destroy the data integrity.
        

        RULES FOR VISUALIZATION (THE LOGIC TREE):
        You have access to 5 chart types: 'scatter', 'bar', 'histogram', 'boxplot' (for outliers), and 'heatmap' (for feature correlation).
        You can generate MULTIPLE 'generate_plot' nodes to build a dashboard.
        
        - Rule A (Strict): If the user specifies a chart and columns, generate exactly ONE node for that request.
        - Rule B (Semi-Strict): If the user specifies a chart type but NO columns (e.g., "Show me boxplots"), generate a separate node for EVERY column where that chart makes mathematical sense based on the data profile.
        - Rule C (Agentic): If the user just says "Visualize" or doesn't specify, you MUST act as a Senior Data Scientist. Generate 3 to 5 nodes that tell a story:
             1. Always include a 'heatmap' to show correlation.
             2. Include a 'histogram' of the most likely Target variable.
             3. Include 'scatter' plots for the top continuous variables.

        You must output ONLY valid JSON matching this exact structure (You are allowed to add multiple plot node_id):
        You must output ONLY valid JSON matching this exact structure (You are allowed to add multiple plot node_id):
        {{
            "metadata": {{"user_id": "{user_id}", "project_id": "{project_id}"}},
            "dataset": {{"file_name": "{file_name}"}},
            "nodes": [
                {{
                    "node_id": "clean_1", 
                    "action_type": "clean_data", 
                    "parameters": {{
                        "remove_duplicates": true,
                        "drop_columns": ["User_ID"], 
                        "impute_rules": {{"Age": "median", "City": "mode"}}
                    }} 
                }},
                {{"node_id": "plot_1", "action_type": "generate_plot", "parameters": {{"chart_type": "heatmap"}}}},
                {{"node_id": "plot_2", "action_type": "generate_plot", "parameters": {{"chart_type": "scatter", "x_col": "Age", "y_col": "Salary"}}}},
                {{"node_id": "train_1", "action_type": "train_model", "parameters": {{"target_column": "Salary", "time_budget_seconds": 10, "model_family": ["xgboost"]}}}}
            ],
            "execution_order": ["clean_1", "plot_1", "plot_2", "train_1"]
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
                validated_contract = PipelineContract(**parsed_data)
                
                return validated_contract.model_dump_json(indent=2)

            except ValidationError as e:
                print(f"⚠️ Attempt {attempt + 1}: LLM hallucinated bad JSON. Retrying...")
                if attempt == 2:
                    raise ValueError(f"LLM repeatedly generated invalid structure. Details: {e}")
                time.sleep(2)
                
            except Exception as e:
                print(f"⚠️ Attempt {attempt + 1}: Groq API error. Retrying...")
                if attempt == 2:
                    raise ConnectionError(f"Groq API failed after 3 retries: {e}")
                time.sleep(2)