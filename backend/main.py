from fastapi import FastAPI, Depends, HTTPException, Security, File, UploadFile, Form
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import os
import shutil
import jwt
import json
import sys
import glob
import io

# ---> NEW INFRASTRUCTURE IMPORTS <---
from connections import engine, get_db, get_minio_client
from models.database_models import Base, DatasetMetadata

# ==========================================
# 1. BHAVYA'S CORE ML IMPORTS (The Black Box)
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

if minio_client:
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
# 5. SECURE CLOUD DATASETS ENDPOINTS
# ==========================================
@app.get("/api/datasets")
async def get_datasets(current_user_id: str = Depends(verify_token), db: Session = Depends(get_db)):
    # 🔍 QUERY POSTGRES INSTEAD OF FOLDERS
    datasets = db.query(DatasetMetadata).filter(DatasetMetadata.user_id == current_user_id).all()
    files = [d.file_name for d in datasets]
    return {"datasets": files}

@app.post("/api/datasets/upload")
async def upload_dataset(file: UploadFile = File(...), current_user_id: str = Depends(verify_token), db: Session = Depends(get_db)):
    print(f"📥 Receiving file '{file.filename}' from user: {current_user_id}")
    
    try:
        # 1. Read file into memory
        file_bytes = await file.read()
        file_size = len(file_bytes)
        file_data = io.BytesIO(file_bytes)

        # 2. Define the exact path in the MinIO Cloud
        minio_path = f"{current_user_id}/{file.filename}"

        # 3. Upload straight to MinIO
        minio_client.put_object(
            BUCKET_NAME,
            minio_path,
            data=file_data,
            length=file_size,
            content_type=file.content_type
        )
        print(f"☁️ Saved securely to MinIO Cloud: {minio_path}")

        # 4. Track it in the PostgreSQL Database
        existing_dataset = db.query(DatasetMetadata).filter_by(user_id=current_user_id, file_name=file.filename).first()
        if existing_dataset:
            existing_dataset.file_size_bytes = file_size
            existing_dataset.minio_path = minio_path
        else:
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
        raise HTTPException(status_code=500, detail=f"Cloud upload failed: {str(e)}")

# ==========================================
# 6. THE AI ROUTER ENDPOINT (Hybrid Bridge)
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

    # 1. Verify user owns this file in PostgreSQL
    dataset_record = db.query(DatasetMetadata).filter_by(user_id=current_user_id, file_name=file_name).first()
    if not dataset_record:
        raise HTTPException(status_code=404, detail="Dataset not found in database. Please upload it first.")

    # 2. HYBRID BRIDGE: Download from Cloud to local temp space for the ML Engine
    user_folder = os.path.join("data", current_user_id)
    os.makedirs(user_folder, exist_ok=True)
    file_path = os.path.join(user_folder, file_name)

    try:
        minio_client.fget_object(BUCKET_NAME, dataset_record.minio_path, file_path)
        print(f"⬇️ Downloaded {file_name} from MinIO to local space for AI processing.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch data from cloud: {e}")

    # ==========================================
    # ---> THE BACKEND FIX: PROMPT AUGMENTATION <---
    # ==========================================
    backend_enforced_prompt = prompt + """
    
    [URGENT SYSTEM OVERRIDE RULES]:
    1. If the user asks to train or predict, you MUST add a 'train_model' node.
    2. Inside the 'train_model' parameters, you MUST include 'target_column' with the exact name of the column to predict.
    3. DO NOT invent a 'split_data' node. Your action_type must strictly be one of: load_dataset, clean_data, train_model, or generate_plot.
    """

    try:
        print("🔍 Profiling data using Bhavya's Engine...")
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
            
            # Inject the real MinIO path so the DAG tracks it!
            raw_json["dataset"]["minio_path"] = dataset_record.minio_path
            
            validated_contract = DAGContract(**raw_json)
            print("🛡️ AI Contract passed Pydantic validation!")
        except json.JSONDecodeError:
            raise HTTPException(status_code=502, detail="Llama 3 returned invalid JSON format.")
        except ValidationError as ve:
            raise HTTPException(status_code=502, detail=f"Llama 3 missed required fields: {ve.errors()}")

        print("⚙️ Executing Graph via Orchestrator...")
        final_response = executor.execute_graph(validated_contract.model_dump(), file_path)
        
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
# 7. SECURE MODEL DOWNLOAD ENDPOINT (Dynamic)
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

# ==========================================
# 8. SECURE CLEAN DATA DOWNLOAD ENDPOINT (Dynamic)
# ==========================================
@app.get("/api/download-clean-data")
async def download_clean_data(current_user_id: str = Depends(verify_token)):
    user_folder = os.path.join("data", current_user_id)
    clean_files = glob.glob(os.path.join(user_folder, "*clean*.csv"))
    
    if not clean_files:
        raise HTTPException(status_code=404, detail="No cleaned dataset found.")
        
    latest_clean_path = max(clean_files, key=os.path.getctime)
    
    return FileResponse(
        path=latest_clean_path, 
        filename="prism_cleaned_data.csv", 
        media_type='text/csv'
    )