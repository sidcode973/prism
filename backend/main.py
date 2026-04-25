from fastapi import FastAPI, Depends, HTTPException, Security, File, UploadFile, Form
from fastapi.responses import FileResponse # <-- ADD THIS
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from typing import List, Dict, Any, Optional
import os
import shutil
import jwt
import json
import sys
from fastapi.responses import FileResponse
# ==========================================
# 1. BHAVYA'S CORE ML IMPORTS (The Black Box)
# ==========================================
# Make sure your editable install (pip install -e ../core_ml) is active!
core_ml_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "core_ml"))
sys.path.append(core_ml_dir)
from prism_ml.profile.profiler import PrismProfiler
from prism_ml.agent.router import PrismRouterAgent
from prism_ml.orchestrator import PrismDAGExecutor

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"],
)

# ==========================================
# 2. THE SECURITY BOUNCER (Kept exactly as you built it!)
# ==========================================
security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        # We decode the Clerk JWT to grab the user's unique ID
        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        user_id = unverified_payload.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
            
        return user_id
        
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token error: {str(e)}")

# ==========================================
# 3. THE PYDANTIC SHIELD (Contract Schema)
# ==========================================
class PipelineNode(BaseModel):
    node_id: str
    action_type: str
    parameters: Dict[str, Any]

class PipelineMetadata(BaseModel):
    user_id: str
    project_id: str
    tier: str = "free"
    max_time_budget_seconds: int = 300

class DatasetInfo(BaseModel):
    file_name: str
    minio_path: Optional[str] = None

class DAGContract(BaseModel):
    metadata: PipelineMetadata
    dataset: DatasetInfo
    nodes: List[PipelineNode]
    execution_order: List[str]

# ==========================================
# 4. INITIALIZE THE ML ENGINE
# ==========================================
profiler = PrismProfiler()
agent = PrismRouterAgent()
executor = PrismDAGExecutor()

# ==========================================
# 5. SECURE DATASETS ENDPOINTS (Unchanged)
# ==========================================
@app.get("/api/datasets")
async def get_datasets(current_user_id: str = Depends(verify_token)):
    user_folder = os.path.join("data", current_user_id)
    
    if not os.path.exists(user_folder):
        return {"datasets": []}
        
    files = [f for f in os.listdir(user_folder) if os.path.isfile(os.path.join(user_folder, f))]
    return {"datasets": files}

@app.post("/api/datasets/upload")
async def upload_dataset(file: UploadFile = File(...), current_user_id: str = Depends(verify_token)):
    print(f"📥 Receiving file '{file.filename}' from user: {current_user_id}")
    
    user_folder = os.path.join("data", current_user_id)
    os.makedirs(user_folder, exist_ok=True)
    file_path = os.path.join(user_folder, file.filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        print(f"✅ Saved securely to {file_path}")
        return {"status": "success", "file_name": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {str(e)}")

# ==========================================
# 6. THE NEW AI ROUTER ENDPOINT (Replaces old manual pipeline)
# ==========================================
@app.post("/api/run-pipeline")
async def run_pipeline(
    file_name: str = Form(...), 
    prompt: str = Form(...),
    current_user_id: str = Depends(verify_token)
):
    print("\n" + "="*50)
    print(f"🔒 SECURE AI REQUEST GRANTED FOR USER: {current_user_id}")
    print(f"🚀 PROMPT: '{prompt}' ON FILE: {file_name}")
    print("="*50)

    # Locate the previously uploaded file
    file_path = os.path.join("data", current_user_id, file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Dataset not found. Please upload it first.")

    try:
        # STEP 1: Profile the data
        print("🔍 Profiling data using Bhavya's Engine...")
        # Passing the exact file path so Polars can read it
        profile = profiler.generate_profile(file_path)
        
        # STEP 2: Ask the AI for the Architecture
        print("🧠 Asking Llama 3 to generate DAG Contract...")
        contract_str = agent.generate_contract(
            user_prompt=prompt, 
            user_id=current_user_id, 
            project_id="dynamic_project_id_here", 
            file_name=file_name, 
            data_profile=profile
        )
        
        # --- THE PYDANTIC SHIELD INTERVENTION ---
        try:
            clean_str = contract_str.replace("```json", "").replace("```", "").strip()
            raw_json = json.loads(clean_str)
            validated_contract = DAGContract(**raw_json)
            print("🛡️ AI Contract passed Pydantic validation!")
        except json.JSONDecodeError:
            raise HTTPException(status_code=502, detail="Llama 3 returned invalid JSON format.")
        except ValidationError as ve:
            raise HTTPException(status_code=502, detail=f"Llama 3 missed required fields: {ve.errors()}")

        # STEP 3: Execute the graph
        print("⚙️ Executing Graph via Orchestrator...")
        final_response = executor.execute_graph(validated_contract.model_dump(), file_path)
        
        # STEP 4: Send the master payload back to Next.js
        print("✅ Pipeline complete! Handing off to Frontend.")
        return {
            "dag_structure": validated_contract.model_dump(),
            "execution_results": final_response
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"❌ Core ML Engine Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Engine Failure: {str(e)}")

# ==========================================
# 7. SECURE MODEL DOWNLOAD ENDPOINT
# ==========================================
# ==========================================
# 7. SECURE MODEL DOWNLOAD ENDPOINT
# ==========================================
@app.get("/api/download-model")
async def download_model(current_user_id: str = Depends(verify_token)):
    # Look for the exact file Bhavya's trainer just saved
    model_path = os.path.join("data", current_user_id, "trained_model.pkl")
    
    if not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail="No trained model found. Run the pipeline first!")
        
    # Send the file to the browser as a downloadable stream
    return FileResponse(
        path=model_path, 
        filename="ai_pipeline_model.pkl", 
        media_type='application/octet-stream'
    )    