import os
import sys
from celery import Celery
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

core_ml_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "core_ml"))
if core_ml_dir not in sys.path:
    sys.path.append(core_ml_dir)

from prism_ml.orchestrator import PrismDAGExecutor
from connections import SessionLocal
from models.database_models import PipelineRun

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery("prism_tasks", broker=REDIS_URL, backend=REDIS_URL)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

@celery_app.task(name="execute_pipeline_task")
def execute_pipeline_task(contract_dict: dict, file_path: str, master_run_id: str, user_id: str):
    db: Session = SessionLocal()
    executor = PrismDAGExecutor()
    
    print(f"⚙️ [Celery Worker] Starting execution for Run ID: {master_run_id}")
    
    try:
        final_response = executor.execute_graph(contract_dict, file_path, master_run_id)
        results = final_response.get("results", {})
        
        run = db.query(PipelineRun).filter(PipelineRun.id == master_run_id).first()
        if run:
            run.status = "success" if final_response.get("status") == "success" else "failed"
            run.best_model_name = results.get("best_model")
            run.task_type = results.get("task_type")
            run.optimization_metric = results.get("optimization_metric")
            run.final_score = results.get("loss")
            run.blueprint_path = results.get("blueprint_path")
            run.model_artifact_path = results.get("trained_model_path")
            run.charts_path = results.get("charts_path")
            run.completed_at = func.now()
            db.commit()
            
        print(f"✅ [Celery Worker] Run ID {master_run_id} completed successfully.")
        return final_response
        
    except Exception as e:
        run = db.query(PipelineRun).filter(PipelineRun.id == master_run_id).first()
        if run:
            run.status = "failed"
            db.commit()
        print(f"❌ [Celery Worker] Execution failed for Run ID {master_run_id}: {e}")
        raise e
    finally:
        db.close()