from fastapi import FastAPI, Depends, HTTPException, Security, File, UploadFile, Form
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import os
import jwt
import json
import sys
import glob
import io

# ==========================================
# ---> OUR NEW INFRASTRUCTURE IMPORTS <---
# ==========================================
from connections import Base, engine, get_db, get_minio_client
from models.database_models import DatasetMetadata

# ==========================================
# 1. PRISM CORE ML IMPORTS (The Black Box)
# ==========================================
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
# 🚀 STARTUP INFRASTRUCTURE INITIALIZATION
# ==========================================
print("🏗️ Creating PostgreSQL Tables...")
Base.metadata.create_all(bind=engine)

BUCKET_NAME = "prism-datasets"
minio_client = get_minio_client()

try:
    if not minio_client.bucket_exists(BUCKET_NAME):
        minio_client.make_bucket(BUCKET_NAME)
        print(f"🪣 Created new MinIO Bucket: '{BUCKET_NAME}'")
    else:
        print(f"🪣 MinIO Bucket '{BUCKET_NAME}' is ready.")
except Exception as e:
    print(f"⚠️ MinIO Bucket Check Failed (is Docker running?): {e}")

# ==========================================
# 2. THE SECURITY BOUNCER
# ==========================================
security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        user_id = unverified_payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        return user_id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token error: {str(e)}")

# ==========================================
# 3. THE PYDANTIC SHIELD 
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

class LLMResponse(BaseModel):
    status: str
    rejection_reason: Optional[str] = None
    pipeline: Optional[DAGContract] = None

# ==========================================
# 4. INITIALIZE THE ML ENGINE
# ==========================================
profiler = PrismProfiler()
agent = PrismRouterAgent()
executor = PrismDAGExecutor()

# ==========================================
# 5. SECURE CLOUD DATASETS ENDPOINTS
# ==========================================
@app.get("/api/datasets")
async def get_datasets(current_user_id: str = Depends(verify_token), db: Session = Depends(get_db)):
    # 🔍 QUERY POSTGRES INSTEAD OF FOLDERS
    datasets = db.query(DatasetMetadata).filter(DatasetMetadata.user_id == current_user_id).all()
    files = [d.file_name for d in datasets]
    return {"datasets": files}

@app.post("/api/datasets/upload")
async def upload_dataset(
    file: UploadFile = File(...), 
    current_user_id: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    print(f"📥 Receiving file '{file.filename}' from user: {current_user_id}")
    
    try:
        # 1. Read file into memory to get its exact size
        file_bytes = await file.read()
        file_size = len(file_bytes)
        file_data = io.BytesIO(file_bytes)

        # 2. Define the exact path in the MinIO Cloud
        minio_path = f"{current_user_id}/{file.filename}"

        # 3. Upload straight to MinIO using the official MinIO Client
        minio_client.put_object(
            BUCKET_NAME,
            minio_path,
            data=file_data,
            length=file_size,
            content_type=file.content_type
        )
        print(f"☁️ Saved securely to MinIO Cloud: {minio_path}")

        # 4. Save Locally for the ML Engine to access quickly
        user_folder = os.path.join("data", current_user_id)
        os.makedirs(user_folder, exist_ok=True)
        file_path = os.path.join(user_folder, file.filename)
        with open(file_path, "wb") as buffer:
            buffer.write(file_bytes)

        # 5. Track it in the PostgreSQL Database
        new_dataset = DatasetMetadata(
            user_id=current_user_id,
            file_name=file.filename,
            minio_path=minio_path,
            file_size_bytes=file_size
        )
        db.add(new_dataset)
        db.commit()
        print("💾 Logged dataset metadata into PostgreSQL!")

        return {"status": "success", "file_name": file.filename}
        
    except Exception as e:
        db.rollback() 
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

# ==========================================
# 6. THE AI ROUTER ENDPOINT
# ==========================================
@app.post("/api/run-pipeline")
async def run_pipeline(
    file_name: str = Form(...), 
    prompt: str = Form(...),
    current_user_id: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    print("\n" + "="*50)
    print(f"🔒 SECURE AI REQUEST GRANTED FOR USER: {current_user_id}")
    print(f"🚀 PROMPT: '{prompt}' ON FILE: {file_name}")
    print("="*50)

    file_path = os.path.join("data", current_user_id, file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Dataset not found locally. Ensure it was uploaded.")

    # Bhavya's excellent new ML nodes are secured right here
    backend_enforced_prompt = prompt + """
    
    [URGENT SYSTEM OVERRIDE RULES]:
    1. Your action_type MUST strictly be one of: fix_csv, clean_data, feature_engineer, generate_plot, train_model.
    2. If the user asks to train a model, you MUST inject 'feature_engineer' before 'train_model'.
    3. Inside the 'train_model' and 'feature_engineer' parameters, you MUST include 'target_column' with the exact name of the column to predict.
    """

    try:
        print("🔍 Profiling data using Profiler Engine...")
        profile = profiler.generate_profile(file_path)
        
        print("🧠 Asking Llama 3 to generate DAG Contract...")
        contract_str = agent.generate_contract(
            user_prompt=backend_enforced_prompt, 
            user_id=current_user_id, 
            project_id="dynamic_project_id_here", 
            file_name=file_name, 
            data_profile=profile
        )
        
        try:
            clean_str = contract_str.replace("```json", "").replace("```", "").strip()
            raw_json = json.loads(clean_str)
            validated_response = LLMResponse(**raw_json)
            print("🛡️ AI Contract passed Pydantic validation!")
        except json.JSONDecodeError:
            raise HTTPException(status_code=502, detail="Llama 3 returned invalid JSON format.")
        except ValidationError as ve:
            raise HTTPException(status_code=502, detail=f"Llama 3 missed required fields: {ve.errors()}")

        if validated_response.status == "error":
            print(f"🛑 LLM ABORTED PIPELINE: {validated_response.rejection_reason}")
            return {
                "dag_structure": None,
                "execution_results": {
                    "status": "warning", 
                    "message": validated_response.rejection_reason
                }
            }

        print("⚙️ Executing Graph via Orchestrator...")
        final_response = executor.execute_graph(validated_response.pipeline.model_dump(), file_path)
        
        print("✅ Pipeline complete! Handing off to Frontend.")
        return {
            "dag_structure": validated_response.pipeline.model_dump(),
            "execution_results": final_response
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"❌ Core ML Engine Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Engine Failure: {str(e)}")

# ==========================================
# 7. SECURE DOWNLOAD ENDPOINTS
# ==========================================
@app.get("/api/download-model")
async def download_model(current_user_id: str = Depends(verify_token)):
    user_folder = os.path.join("data", current_user_id)
    model_files = glob.glob(os.path.join(user_folder, "*.pkl"))
    
    if not model_files:
        raise HTTPException(status_code=404, detail="No trained model found. Run the pipeline first!")
        
    latest_model_path = max(model_files, key=os.path.getctime)
    return FileResponse(
        path=latest_model_path, 
        filename="prism_ai_model.pkl", 
        media_type='application/octet-stream'
    )

@app.get("/api/download-clean-data")
async def download_clean_data(current_user_id: str = Depends(verify_token)):
    user_folder = os.path.join("data", current_user_id)
    all_csvs = glob.glob(os.path.join(user_folder, "*.csv"))
    generated_files = [f for f in all_csvs if "clean" in f or "fixed" in f or "engineered" in f]
    
    if not generated_files:
        raise HTTPException(status_code=404, detail="No processed dataset found.")
        
    latest_path = max(generated_files, key=os.path.getctime)
    return FileResponse(
        path=latest_path, 
        filename="prism_processed_data.csv", 
        media_type='text/csv'
    )