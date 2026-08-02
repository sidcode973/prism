from fastapi import FastAPI, Depends, HTTPException, Security, File, UploadFile, Form
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import List, Dict, Any, Optional
from jwt import PyJWKClient
import jwt
import os
import json
import sys
import io
import uuid
import s3fs

# ==========================================
# ---> OUR NEW INFRASTRUCTURE IMPORTS <---
# ==========================================
from connections import Base, engine, get_db, get_minio_client
from models.database_models import DatasetMetadata, PipelineRun, RunStepMetadata

# ==========================================
# 1. PRISM CORE ML IMPORTS (The Black Box)
# ==========================================
core_ml_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "core_ml"))
sys.path.append(core_ml_dir)
# IGNORE VS CODE PYLANCE WARNINGS HERE. IT WILL RUN PERFECTLY.
from prism_ml.profile.profiler import PrismProfiler
from prism_ml.agent.router import PrismRouterAgent, PipelineContract, RouterResponse
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
# 2. THE SECURITY BOUNCER (PROJECT SENTINEL GRADE)
# ==========================================
security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        issuer = unverified_payload.get("iss")
        if not issuer:
            raise HTTPException(status_code=401, detail="Invalid token: no issuer found")

        jwks_url = f"{issuer.rstrip('/')}/.well-known/jwks.json"
        jwks_client = PyJWKClient(jwks_url, headers={"User-Agent": "Prism-Backend/1.0"})

        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"require": ["exp", "sub", "iss"]}
        )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid authentication token: missing sub claim")

        return user_id

    except jwt.ExpiredSignatureError:
        print("🔐 JWT Error: Token has expired")
        raise HTTPException(status_code=401, detail="Token has expired")
    except Exception as e:
        print(f"🔐 JWT Error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")

# ==========================================
# 3. INITIALIZE THE ML ENGINE
# ==========================================
profiler = PrismProfiler()
agent = PrismRouterAgent()
executor = PrismDAGExecutor()

# ==========================================
# 4. SECURE CLOUD DATASETS ENDPOINTS
# ==========================================
@app.get("/api/datasets")
async def get_datasets(current_user_id: str = Depends(verify_token), db: Session = Depends(get_db)):
    datasets = db.query(DatasetMetadata).filter(DatasetMetadata.user_id == current_user_id).all()
    return {"datasets": [{"id": d.id, "file_name": d.file_name} for d in datasets]}

@app.post("/api/datasets/upload")
async def upload_dataset(
    file: UploadFile = File(...), 
    current_user_id: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    print(f"📥 Receiving file '{file.filename}' from user: {current_user_id}")
    
    try:
        file_bytes = await file.read()
        file_size = len(file_bytes)
        file_data = io.BytesIO(file_bytes)

        dataset_id = str(uuid.uuid4())
        minio_path = f"{current_user_id}/{dataset_id}/{file.filename}"

        minio_client.put_object(
            BUCKET_NAME,
            minio_path,
            data=file_data,
            length=file_size,
            content_type=file.content_type
        )
        print(f"☁️ Saved securely to MinIO Cloud: {minio_path}")

        new_dataset = DatasetMetadata(
            id=dataset_id,
            user_id=current_user_id,
            file_name=file.filename,
            minio_path=minio_path,
            file_size_bytes=file_size
        )
        db.add(new_dataset)
        db.commit()
        print("💾 Logged dataset metadata into PostgreSQL!")

        return {"status": "success", "dataset_id": dataset_id, "file_name": file.filename}
        
    except Exception as e:
        db.rollback() 
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

# ==========================================
# 5. THE AI ROUTER ENDPOINT (POSTGRES LOGGED)
# ==========================================
@app.post("/api/run-pipeline")
async def run_pipeline(
    dataset_id: str = Form(...),
    prompt: str = Form(...),
    current_user_id: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    print("\n" + "="*50)
    print(f"🔒 SECURE AI REQUEST GRANTED FOR USER: {current_user_id}")
    print("="*50)

    dataset_record = db.query(DatasetMetadata).filter(
        DatasetMetadata.user_id == current_user_id, 
        DatasetMetadata.id == dataset_id
    ).first()
    
    if not dataset_record:
        raise HTTPException(status_code=404, detail="Dataset ID not found in database.")

    file_name = dataset_record.file_name
    file_path = f"s3://{BUCKET_NAME}/{dataset_record.minio_path}"
    
    pipeline_run = PipelineRun(
        user_id=current_user_id,
        dataset_id=dataset_id,
        status="running"
    )
    db.add(pipeline_run)
    db.commit()
    db.refresh(pipeline_run)

    backend_enforced_prompt = prompt + """
    
    [URGENT SYSTEM OVERRIDE RULES]:
    1. Your action_type MUST strictly be one of: fix_csv, clean_data, feature_engineer, generate_plot, train_model.
    2. If the user asks to train a model, you MUST inject 'feature_engineer' before 'train_model'.
    3. Inside the 'train_model' and 'feature_engineer' parameters, you MUST include 'target_column' with the exact name of the column to predict.
    """

    try:
        print(f"🔍 Profiling data using Profiler Engine directly from {file_path}...")
        profile = profiler.generate_profile(file_path)
        
        print("🧠 Asking Llama 3 to generate DAG Contract...")
        contract_str = agent.generate_contract(
            user_prompt=backend_enforced_prompt, 
            user_id=current_user_id, 
            project_id=str(pipeline_run.id),
            file_name=file_name, 
            data_profile=profile
        )
        
        try:
            clean_str = contract_str.replace("```json", "").replace("```", "").strip()
            raw_json = json.loads(clean_str)
            validated_response = RouterResponse(**raw_json)
            print("🛡️ AI Contract passed Pydantic validation!")
        except Exception as ve:
            pipeline_run.status = "failed"
            db.commit()
            raise HTTPException(status_code=502, detail=f"Llama 3 returned invalid format: {ve}")

        if validated_response.status == "error":
            print(f"🛑 LLM ABORTED PIPELINE: {validated_response.rejection_reason}")
            pipeline_run.status = "failed"
            db.commit()
            return {
                "dag_structure": None,
                "execution_results": {
                    "status": "warning", 
                    "message": validated_response.rejection_reason
                }
            }

        print("⚙️ Executing Graph via Orchestrator...")
        final_response = executor.execute_graph(validated_response.pipeline.model_dump(), file_path)
        
        ml_metadata = final_response.get("results", {}).get("metadata", {})
        if ml_metadata:
            step_meta = RunStepMetadata(
                run_id=pipeline_run.id,
                node_id="system_aggregated_metadata",
                node_type="metadata",
                metadata_json=ml_metadata
            )
            db.add(step_meta)
            
        pipeline_run.status = "success" if final_response.get("status") == "success" else "failed"
        db.commit()

        print("✅ Pipeline complete! Handing off to Frontend.")
        return {
            "dag_structure": validated_response.pipeline.model_dump(),
            "execution_results": final_response,
            "run_id": str(pipeline_run.id) # Ensure this is passed as string
        }
        
    except HTTPException as he:
        pipeline_run.status = "failed"
        db.commit()
        raise he
    except Exception as e:
        pipeline_run.status = "failed"
        db.commit()
        print(f"❌ Core ML Engine Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Engine Failure: {str(e)}")

# ==========================================
# 6. SECURE CLOUD DOWNLOAD ENDPOINTS
# ==========================================
def get_s3_fs():
    s3_endpoint = os.getenv("MINIO_ENDPOINT_URL", "http://127.0.0.1:9000")
    s3_key = os.getenv("MINIO_ACCESS_KEY", "prismadmin")
    s3_secret = os.getenv("MINIO_SECRET_KEY", "prismpassword")
    
    return s3fs.S3FileSystem(
        client_kwargs={'endpoint_url': s3_endpoint},
        key=s3_key,
        secret=s3_secret
    )

def _get_mod_time(file_info: dict):
    return file_info.get('LastModified') or file_info.get('last_modified') or 0

@app.get("/api/download-model")
async def download_model(current_user_id: str = Depends(verify_token), db: Session = Depends(get_db)):
    fs = get_s3_fs()
    
    # THE FIX: Search the ENTIRE user directory recursively to prevent pathing mismatches
    bucket_path = f"{BUCKET_NAME}/{current_user_id}"
    
    try:
        all_files = fs.find(bucket_path, detail=True)
    except FileNotFoundError:
        all_files = {}

    try:
        model_files = [info for path, info in all_files.items() if path.endswith('.pkl')]
        
        if not model_files:
            raise HTTPException(status_code=404, detail="No trained model found. You must run a pipeline with 'Train Model' first.")
            
        latest_file = max(model_files, key=_get_mod_time)
        s3_path = f"s3://{latest_file['name']}"
        
        def iterfile():
            with fs.open(s3_path, "rb") as f:
                yield from f
                
        return StreamingResponse(
            iterfile(), 
            media_type='application/octet-stream', 
            headers={"Content-Disposition": 'attachment; filename="prism_ai_model.pkl"'}
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model Download Error: {str(e)}")

@app.get("/api/download-csv")
async def download_csv(stage: str, current_user_id: str = Depends(verify_token), db: Session = Depends(get_db)):
    fs = get_s3_fs()
    
    # THE FIX: Search the ENTIRE user directory recursively to prevent pathing mismatches
    bucket_path = f"{BUCKET_NAME}/{current_user_id}"
    
    try:
        all_files = fs.find(bucket_path, detail=True)
    except FileNotFoundError:
        all_files = {}

    try:
        stage_map = {
            "fixed": "structurally_fixed",
            "cleaned": "cleaned_dataset",
            "engineered": "engineered_dataset"
        }
        
        if stage not in stage_map:
            raise HTTPException(status_code=400, detail="Invalid stage. Use 'fixed', 'cleaned', or 'engineered'.")
            
        file_tag = stage_map[stage]
        
        generated_files = [
            info for path, info in all_files.items()
            if path.endswith('.csv') and file_tag in path
        ]
        
        if not generated_files:
            raise HTTPException(status_code=404, detail=f"No '{stage}' dataset found. The pipeline may not have executed this step.")
            
        latest_file = max(generated_files, key=_get_mod_time)
        s3_path = f"s3://{latest_file['name']}"
        
        def iterfile():
            with fs.open(s3_path, "rb") as f:
                yield from f
                
        return StreamingResponse(
            iterfile(), 
            media_type='text/csv', 
            headers={"Content-Disposition": f'attachment; filename="prism_{stage}_data.csv"'}
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSV Download Error: {str(e)}")