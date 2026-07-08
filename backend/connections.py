import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base # <--- NEW IMPORT
from minio import Minio

# ==========================================
# 1. POSTGRESQL CONNECTION
# ==========================================
# Inside connections.py
# Inside connections.py
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://prismadmin:prismpassword@127.0.0.1:5432/prismdb" 
)

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ---> DECLARE BASE HERE SO MODELS CAN IMPORT IT <---
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Inside connections.py
def get_minio_client():
    """Initializes and returns the official MinIO Python SDK client."""
    endpoint = os.getenv("MINIO_ENDPOINT", "127.0.0.1:9000") # Force IPv4 here too!
    access_key = os.getenv("MINIO_ACCESS_KEY", "prismadmin") # <--- CHANGED THIS
    secret_key = os.getenv("MINIO_SECRET_KEY", "prismpassword") # <--- CHANGED THIS
    
    client = Minio(
        endpoint,
        access_key=access_key,
        secret_key=secret_key,
        secure=False  
    )
    return client
