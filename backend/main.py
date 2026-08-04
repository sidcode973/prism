import os
import sys
import io
import json
import uuid
import s3fs
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Depends, HTTPException, Security, File, UploadFile, Form
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from jwt import PyJWKClient
import jwt

# ==========================================
# 1. INFRASTRUCTURE & DATABASE IMPORTS
# ==========================================
from connections import Base, engine, get_db, get_minio_client
from models.database_models import DatasetMetadata, PipelineRun, RunStepMetadata

# ==========================================
# 2. PRISM CORE ML IMPORTS
# ==========================================
core_ml_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "core_ml"))
if core_ml_dir not in sys.path:
    sys.path.append(core_ml_dir)

from prism_ml.profile.profiler import PrismProfiler
from prism_ml.agent.router import PrismRouterAgent, RouterResponse
from prism_ml.orchestrator import PrismDAGExecutor

# ==========================================
# 3. CELERY TASK IMPORTS
# ==========================================
from celery_worker import execute_pipeline_task

app = FastAPI(title="Prism MLOps Engine", version="2.0")

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
# SECURITY BOUNCER (PROJECT SENTINEL GRADE)
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
            raise HTTPException(status_code=401, detail="Invalid token: missing sub claim")

        return user_id

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")

# ==========================================
# INITIALIZE CORE ENGINES
# ==========================================
profiler = PrismProfiler()
agent = PrismRouterAgent()
executor = PrismDAGExecutor()

def get_s3_fs():
    s3_endpoint = os.getenv("MINIO_ENDPOINT_URL", "http://127.0.0.1:9000")
    s3_key = os.getenv("MINIO_ACCESS_KEY", "prismadmin")
    s3_secret = os.getenv("MINIO_SECRET_KEY", "prismpassword")
    
    return s3fs.S3FileSystem(
        client_kwargs={'endpoint_url': s3_endpoint},
        key=s3_key,
        secret=s3_secret
    )

# ==========================================
# DATASET ENDPOINTS
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

        new_dataset = DatasetMetadata(
            id=dataset_id,
            user_id=current_user_id,
            file_name=file.filename,
            minio_path=minio_path,
            file_size_bytes=file_size
        )
        db.add(new_dataset)
        db.commit()

        return {"status": "success", "dataset_id": dataset_id, "file_name": file.filename}
        
    except Exception as e:
        db.rollback() 
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.get("/api/datasets/{dataset_id}/columns")
async def get_dataset_columns(
    dataset_id: str, 
    current_user_id: str = Depends(verify_token), 
    db: Session = Depends(get_db)
):
    dataset = db.query(DatasetMetadata).filter(
        DatasetMetadata.id == dataset_id, 
        DatasetMetadata.user_id == current_user_id
    ).first()
    
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    fs = get_s3_fs()
    s3_path = f"s3://{BUCKET_NAME}/{dataset.minio_path}"
    
    try:
        with fs.open(s3_path, 'r', encoding='utf-8', errors='ignore') as f:
            first_line = f.readline()
            import re
            columns = [c.strip('"\n\r ') for c in re.split(r',|;|\||\t', first_line)]
            columns = [c for c in columns if c] 
            
        return {"columns": columns}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read dataset schema: {str(e)}")

# ==========================================
# RUN PIPELINE ENDPOINT (THE HYBRID OVERRIDE)
# ==========================================
@app.post("/api/run-pipeline")
async def run_pipeline(
    dataset_id: str = Form(...),
    prompt: str = Form(...),
    manual_nodes: Optional[str] = Form(None),
    manual_edges: Optional[str] = Form(None),
    async_mode: bool = Form(False),
    current_user_id: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    dataset_record = db.query(DatasetMetadata).filter(
        DatasetMetadata.user_id == current_user_id, 
        DatasetMetadata.id == dataset_id
    ).first()
    
    if not dataset_record:
        raise HTTPException(status_code=404, detail="Dataset ID not found in database.")

    file_name = dataset_record.file_name
    file_path = f"s3://{BUCKET_NAME}/{dataset_record.minio_path}"
    master_run_id = uuid.uuid4().hex[:8]
    
    pipeline_run = PipelineRun(
        id=master_run_id,
        user_id=current_user_id,
        dataset_id=dataset_id,
        status="running"
    )
    db.add(pipeline_run)
    db.commit()

    base_prompt = prompt.strip()
    manual_context = ""
    
    if manual_nodes:
        # Prevent the LLM from throwing the "No pipeline actions" error
        if not base_prompt:
            base_prompt = "Adopt my manual canvas state exactly. Auto-complete any missing mathematical parameters optimally based on the schema profile. DO NOT reject."
            
        try:
            parsed_nodes = json.loads(manual_nodes)
            parsed_edges = json.loads(manual_edges) if manual_edges else []
            manual_context = f"\n[USER MANUAL CANVAS STATE]:\nNodes: {json.dumps(parsed_nodes)}\nEdges: {json.dumps(parsed_edges)}\n"
        except json.JSONDecodeError:
            pass

    backend_enforced_prompt = base_prompt + manual_context + """
    [URGENT SYSTEM OVERRIDE RULES]:
    1. Action types must strictly be: fix_csv, clean_data, feature_engineer, generate_plot, train_model.
    2. Include 'target_column' ONLY IF 'train_model' or 'feature_engineer' is present.
    3. NEVER reject a request if [USER MANUAL CANVAS STATE] is provided.
    """

    try:
        profile = profiler.generate_profile(file_path)
        contract_str = agent.generate_contract(
            user_prompt=backend_enforced_prompt, 
            user_id=current_user_id, 
            project_id=master_run_id,
            file_name=file_name, 
            data_profile=profile
        )
        
        clean_str = contract_str.replace("```json", "").replace("```", "").strip()
        raw_json = json.loads(clean_str)
        validated_response = RouterResponse(**raw_json)

        if validated_response.status == "error":
            pipeline_run.status = "failed"
            db.commit()
            return {
                "run_id": master_run_id,
                "dag_structure": None,
                "execution_results": {"status": "warning", "message": validated_response.rejection_reason}
            }

        contract_dict = validated_response.pipeline.model_dump()

        # 🛡️ THE HYBRID CANVAS OVERRIDE 🛡️
        # We let the AI generate smart defaults (like impute_rules), but we force-merge
        # your explicit UI settings on top of them, and lock the graph topology to match the canvas.
        if manual_nodes:
            try:
                # 1. Group LLM parameters by action_type
                llm_params_by_type = {}
                for llm_node in contract_dict.get("nodes", []):
                    l_type = llm_node["action_type"]
                    if l_type not in llm_params_by_type:
                        llm_params_by_type[l_type] = []
                    llm_params_by_type[l_type].append(llm_node.get("parameters", {}))
                    
                # 2. Rebuild Final Nodes from Manual Canvas
                final_nodes = []
                type_counters = {}
                for man_node in parsed_nodes:
                    m_type = man_node["data"]["action_type"]
                    if m_type not in type_counters: type_counters[m_type] = 0
                    idx = type_counters[m_type]
                    
                    # Start with LLM's smart defaults (if available)
                    final_params = {}
                    if m_type in llm_params_by_type and idx < len(llm_params_by_type[m_type]):
                        final_params = dict(llm_params_by_type[m_type][idx])
                        
                    # Hardcoded fallback just in case LLM misses it
                    if m_type == "generate_plot" and "chart_type" not in final_params:
                        final_params["chart_type"] = "scatter"
                        
                    # Override with user explicit config from UI
                    user_config = man_node["data"].get("config", {})
                    for k, v in user_config.items():
                        if v != "" and v is not None:
                            final_params[k] = v
                            
                    final_nodes.append({
                        "node_id": man_node["id"],
                        "action_type": m_type,
                        "parameters": final_params
                    })
                    type_counters[m_type] += 1
                    
                # 3. Topological Sort for execution order based purely on UI edges
                adj = {n["id"]: [] for n in parsed_nodes}
                in_degree = {n["id"]: 0 for n in parsed_nodes}
                for edge in parsed_edges:
                    src = edge.get("source")
                    tgt = edge.get("target")
                    if src in adj and tgt in in_degree:
                        adj[src].append(tgt)
                        in_degree[tgt] += 1
                        
                from collections import deque
                queue = deque([n for n in in_degree if in_degree[n] == 0])
                exec_order = []
                while queue:
                    curr = queue.popleft()
                    exec_order.append(curr)
                    for nbr in adj[curr]:
                        in_degree[nbr] -= 1
                        if in_degree[nbr] == 0:
                            queue.append(nbr)
                            
                # Failsafe if the graph is disconnected
                if len(exec_order) != len(parsed_nodes):
                    exec_order = [n["id"] for n in parsed_nodes]
                    
                contract_dict["nodes"] = final_nodes
                contract_dict["execution_order"] = exec_order
                print("🛡️ Hybrid Override Complete: Merged AI Smarts with Manual UI Structure.")
            except Exception as e:
                print(f"⚠️ Hybrid canvas override failed: {e}")

        # Map test dataset paths if training model
        for node in contract_dict.get("nodes", []):
            if node["action_type"] == "train_model":
                test_id = node["parameters"].get("test_dataset_id")
                if test_id:
                    test_record = db.query(DatasetMetadata).filter(DatasetMetadata.id == test_id).first()
                    if test_record:
                        node["parameters"]["test_dataset_path"] = f"s3://{BUCKET_NAME}/{test_record.minio_path}"

        if async_mode:
            print(f"⚡ Dispatching Run {master_run_id} to Celery Task Queue...")
            execute_pipeline_task.delay(contract_dict, file_path, master_run_id, current_user_id)
            return {
                "status": "queued",
                "message": "Pipeline execution queued asynchronously.",
                "run_id": master_run_id
            }
        else:
            print(f"⚙️ Executing Graph Inline for Run {master_run_id}...")
            final_response = executor.execute_graph(contract_dict, file_path, master_run_id)
            
            results = final_response.get("results", {})
            raw_loss = results.get("loss")
            safe_loss = float(raw_loss) if raw_loss is not None else None
            
            pipeline_run.status = "success" if final_response.get("status") == "success" else "failed"
            pipeline_run.best_model_name = results.get("best_model")
            pipeline_run.task_type = results.get("task_type")
            pipeline_run.optimization_metric = results.get("optimization_metric")
            pipeline_run.final_score = safe_loss
            pipeline_run.blueprint_path = results.get("blueprint_path")
            pipeline_run.model_artifact_path = results.get("trained_model_path")
            pipeline_run.completed_at = func.now()
            
            db.commit()

            return {
                "run_id": master_run_id,
                "dag_structure": contract_dict,
                "execution_results": final_response
            }

    except Exception as e:
        pipeline_run.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Engine Execution Failure: {str(e)}")

# ==========================================
# SECURE RUN-ISOLATED DOWNLOAD ENDPOINTS
# ==========================================
@app.get("/api/download-model")
async def download_model(
    run_id: str, 
    current_user_id: str = Depends(verify_token), 
    db: Session = Depends(get_db)
):
    run = db.query(PipelineRun).filter(
        PipelineRun.id == run_id, 
        PipelineRun.user_id == current_user_id
    ).first()
    
    if not run or not run.model_artifact_path:
        raise HTTPException(status_code=404, detail=f"No trained model found for Run ID: {run_id}")

    fs = get_s3_fs()
    s3_path = run.model_artifact_path if run.model_artifact_path.startswith("s3://") else f"s3://{run.model_artifact_path}"

    try:
        def iterfile():
            with fs.open(s3_path, "rb") as f:
                yield from f
                
        return StreamingResponse(
            iterfile(), 
            media_type='application/octet-stream', 
            headers={"Content-Disposition": f'attachment; filename="prism_model_{run_id}.pkl"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model Download Error: {str(e)}")

@app.get("/api/download-csv")
async def download_csv(
    stage: str, 
    run_id: str,
    current_user_id: str = Depends(verify_token), 
    db: Session = Depends(get_db)
):
    run = db.query(PipelineRun).filter(
        PipelineRun.id == run_id, 
        PipelineRun.user_id == current_user_id
    ).first()
    
    if not run:
        raise HTTPException(status_code=404, detail=f"Run ID '{run_id}' not found.")

    stage_map = {
        "fixed": f"structurally_fixed_{run_id}.csv",
        "cleaned": f"cleaned_dataset_{run_id}.csv",
        "engineered": f"engineered_dataset_{run_id}.csv"
    }

    if stage not in stage_map:
        raise HTTPException(status_code=400, detail="Invalid stage. Use 'fixed', 'cleaned', or 'engineered'.")

    target_filename = stage_map[stage]
    dataset = db.query(DatasetMetadata).filter(DatasetMetadata.id == run.dataset_id).first()
    
    if not dataset:
        raise HTTPException(status_code=404, detail="Associated dataset record missing.")

    dataset_dir = "/".join(dataset.minio_path.split("/")[:-1])
    full_s3_path = f"s3://{BUCKET_NAME}/{dataset_dir}/{target_filename}"

    fs = get_s3_fs()
    if not fs.exists(full_s3_path):
        raise HTTPException(status_code=404, detail=f"No '{stage}' dataset artifact found for Run ID: {run_id}")

    try:
        def iterfile():
            with fs.open(full_s3_path, "rb") as f:
                yield from f
                
        return StreamingResponse(
            iterfile(), 
            media_type='text/csv', 
            headers={"Content-Disposition": f'attachment; filename="prism_{stage}_{run_id}.csv"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSV Download Error: {str(e)}")