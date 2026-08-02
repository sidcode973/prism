from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

# Import the Base from your connections file
from connections import Base 

def generate_uuid():
    return str(uuid.uuid4())

class DatasetMetadata(Base):
    __tablename__ = "datasets"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    user_id = Column(String, index=True, nullable=False)
    file_name = Column(String, nullable=False)
    
    # This is the magic link! Where does this live in the MinIO cloud?
    minio_path = Column(String, nullable=False) 
    
    file_size_bytes = Column(Integer)
    upload_timestamp = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, default="available") # "available", "processing", "error" 
    
    # Relationship mapping to the pipeline runs
    runs = relationship("PipelineRun", back_populates="dataset")

class PipelineRun(Base):
    """Tracks a single execution of the AI Pipeline for a specific dataset."""
    __tablename__ = "pipeline_runs"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    user_id = Column(String, index=True, nullable=False)
    dataset_id = Column(String, ForeignKey("datasets.id"), nullable=False)
    
    status = Column(String, default="queued") # "queued", "running", "success", "failed"
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    dataset = relationship("DatasetMetadata", back_populates="runs")
    steps = relationship("RunStepMetadata", back_populates="run", cascade="all, delete-orphan")

class RunStepMetadata(Base):
    """Permanently stores the state/metadata of each individual ML node (e.g. column_roles)."""
    __tablename__ = "run_step_metadata"

    id = Column(String, primary_key=True, default=generate_uuid, index=True)
    run_id = Column(String, ForeignKey("pipeline_runs.id"), nullable=False)
    
    node_id = Column(String, nullable=False) # e.g., "clean_1"
    node_type = Column(String, nullable=False) # e.g., "clean_data"
    
    # This JSON column will safely store the dicts we return from our core_ml scripts!
    metadata_json = Column(JSON, nullable=False, default={})
    
    run = relationship("PipelineRun", back_populates="steps")