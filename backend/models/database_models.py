from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

# Import the Base from your connections file
from connections import Base 

def generate_uuid():
    return str(uuid.uuid4())

class DatasetMetadata(Base):
    """Acts as the 'Project' Root. Tied to a specific uploaded file."""
    __tablename__ = "datasets"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    user_id = Column(String, index=True, nullable=False)
    file_name = Column(String, nullable=False)
    
    # The physical location of the raw uploaded file in MinIO
    minio_path = Column(String, nullable=False) 
    
    file_size_bytes = Column(Integer)
    upload_timestamp = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, default="available") # "available", "processing", "error" 
    
    # Relationship mapping to the pipeline runs (Train data)
    runs = relationship("PipelineRun", back_populates="dataset", foreign_keys="[PipelineRun.dataset_id]")
    
    # Relationship mapping if this dataset is ever used explicitly as Test data
    test_runs = relationship("PipelineRun", back_populates="test_dataset", foreign_keys="[PipelineRun.test_dataset_id]")


class PipelineRun(Base):
    """Tracks a single execution attempt under a Dataset Project."""
    __tablename__ = "pipeline_runs"

    # This will match the master_run_id generated in your API before execution
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    
    # The primary dataset (The Project)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False)
    
    # Optional: If the user uploaded/selected a specific file just for testing
    test_dataset_id = Column(String, ForeignKey("datasets.id"), nullable=True)
    
    status = Column(String, default="queued") # "queued", "running", "success", "failed"
    
    # ==========================================
    # FAST-ACCESS UI METRICS (For the History Page)
    # ==========================================
    best_model_name = Column(String, nullable=True)
    task_type = Column(String, nullable=True)
    optimization_metric = Column(String, nullable=True)
    final_score = Column(Float, nullable=True)
    
    # ==========================================
    # MINIO ARTIFACT POINTERS (The Vault Links)
    # ==========================================
    blueprint_path = Column(String, nullable=True)
    charts_path = Column(String, nullable=True)
    model_artifact_path = Column(String, nullable=True)

    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    dataset = relationship("DatasetMetadata", foreign_keys=[dataset_id], back_populates="runs")
    test_dataset = relationship("DatasetMetadata", foreign_keys=[test_dataset_id], back_populates="test_runs")
    
    # Keeping this if you still want to track UI canvas node arrangements
    steps = relationship("RunStepMetadata", back_populates="run", cascade="all, delete-orphan")


class RunStepMetadata(Base):
    """Stores lightweight UI state for the DAG canvas nodes (e.g., coordinates, manual parameters)."""
    __tablename__ = "run_step_metadata"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    run_id = Column(String, ForeignKey("pipeline_runs.id"), nullable=False)
    
    node_id = Column(String, nullable=False) # e.g., "clean_1"
    node_type = Column(String, nullable=False) # e.g., "clean_data"
    
    # Only store manual UI parameters here. The ML math goes in the MinIO blueprint!
    metadata_json = Column(JSON, nullable=False, default={})
    
    run = relationship("PipelineRun", back_populates="steps")