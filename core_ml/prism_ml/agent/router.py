# This file is for converting natural language prompts into a strict JSON format that our backend & frontend can understand.
import os
import json
from typing import List, Dict, Any
from pydantic import BaseModel, ValidationError
from groq import Groq
from dotenv import load_dotenv

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
    def generate_contract(self, user_prompt: str, user_id: str, project_id: str, file_name: str) -> str:
        """
        Takes a human prompt and returns a validated JSON string.
        """
        
        system_prompt = f"""
        You are the Master Agent for Project Prism. Your job is to translate user requests into a strict JSON pipeline contract.
        
        The user is: {user_id}
        The dataset is: {file_name}
        The minio_path should always be: s3://prism-data/{user_id}/{file_name}
        
        You must output ONLY valid JSON. No markdown, no conversational text.
        The JSON must match this exact structure:
        {{
            "metadata": {{"user_id": "{user_id}", "project_id": "{project_id}", "tier": "free", "max_time_budget_seconds": 300}},
            "dataset": {{"file_name": "{file_name}", "minio_path": "s3://prism-data/{user_id}/{file_name}"}},
            "nodes": [
                {{"node_id": "step_1", "action_type": "clean_data", "parameters": {{"drop_columns": [], "impute_strategy": "median"}} }}
            ],
            "execution_order": ["step_1"]
        }}
        """

        try:
            # Force the model to return JSON
            response = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model=self.model,
                response_format={"type": "json_object"}, # This is the magic bullet
                temperature=0.1 # Keep it low so it doesn't get creative
            )

            raw_json = response.choices[0].message.content
            
            # Validate the AI's output using our Pydantic enforcers
            parsed_data = json.loads(raw_json)
            validated_contract = PipelineContract(**parsed_data)
            
            # Return the perfect JSON string to send to the backend
            return validated_contract.model_dump_json(indent=2)

        except ValidationError as e:
            return f"Error: LLM generated invalid structure. Details: {e}"
        except Exception as e:
            return f"Error connecting to Groq: {e}"