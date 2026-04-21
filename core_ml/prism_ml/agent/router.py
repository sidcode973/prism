# This file is for converting natural language prompts into a strict JSON format that our backend & frontend can understand.
import os
import json
from typing import List, Dict, Any
from pydantic import BaseModel, ValidationError
from groq import Groq
from dotenv import load_dotenv
import time
# Load your Groq API key from the .env file
load_dotenv()

# ==========================================
# 1. PYDANTIC MODELS (The Enforcers)
# ==========================================
# These classes guarantee that if the LLM hallucinates, 
# Python will catch it immediately before it breaks the backend.

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
        1. Automatically drop columns useless for ML (IDs, Names, 100% unique strings).
        2. Impute nulls with a single global strategy ("median" or "mode").

        RULES FOR VISUALIZATION (THE LOGIC TREE):
        You have access to 5 chart types: 'scatter', 'bar', 'histogram', 'boxplot' (for outliers), and 'heatmap' (for feature correlation).
        You can generate MULTIPLE 'generate_plot' nodes to build a dashboard.
        
        - Rule A (Strict): If the user specifies a chart and columns, generate exactly ONE node for that request.
        - Rule B (Semi-Strict): If the user specifies a chart type but NO columns (e.g., "Show me boxplots"), generate a separate node for EVERY column where that chart makes mathematical sense based on the data profile.
        - Rule C (Agentic): If the user just says "Visualize" or doesn't specify, you MUST act as a Senior Data Scientist. Generate 3 to 5 nodes that tell a story:
             1. Always include a 'heatmap' to show correlation.
             2. Include a 'histogram' of the most likely Target variable.
             3. Include 'scatter' plots for the top continuous variables.

        You must output ONLY valid JSON matching this exact structure(You are allowed to add multiple plot node_id):
        {{
            "metadata": {{"user_id": "{user_id}", "project_id": "{project_id}"}},
            "dataset": {{"file_name": "{file_name}"}},
            "nodes": [
                {{"node_id": "clean_1", "action_type": "clean_data", "parameters": {{"drop_columns": [], "impute_strategy": "median"}} }},
                {{"node_id": "plot_1", "action_type": "generate_plot", "parameters": {{"chart_type": "heatmap"}} }},
                {{"node_id": "plot_2", "action_type": "generate_plot", "parameters": {{"chart_type": "histogram", "target_col": "Salary"}} }},
                {{"node_id": "plot_3", "action_type": "generate_plot", "parameters": {{"chart_type": "boxplot", "target_col": "Age"}} }}
            ],
            "execution_order": ["clean_1", "plot_1", "plot_2", "plot_3"]
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
                
                # If we get here, it worked! Return the JSON and exit the function entirely.
                return validated_contract.model_dump_json(indent=2)

            except ValidationError as e:
                print(f"⚠️ Attempt {attempt + 1}: LLM hallucinated bad JSON. Retrying...")
                if attempt == 2:
                    # After 3 fails, RAISE the error so the Orchestrator's try/except block catches it
                    raise ValueError(f"LLM repeatedly generated invalid structure. Details: {e}")
                time.sleep(2)
                
            except Exception as e:
                print(f"⚠️ Attempt {attempt + 1}: Groq API error. Retrying...")
                if attempt == 2:
                    # After 3 fails, RAISE the error
                    raise ConnectionError(f"Groq API failed after 3 retries: {e}")
                time.sleep(2)