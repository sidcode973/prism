from sqlalchemy import Column, Integer, String, DateTime, Float
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