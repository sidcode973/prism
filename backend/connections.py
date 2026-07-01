from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from minio import Minio

print("🔌 Initializing Infrastructure Connections...")

# ==========================================
# 1. POSTGRESQL DATABASE SETUP
# ==========================================
# This URL matches the exact credentials we used in the Docker command
SQLALCHEMY_DATABASE_URL = "postgresql://prismadmin:prismpassword@localhost:5432/prismdb"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """Dependency injection for FastAPI to get a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==========================================
# 2. MINIO CLOUD STORAGE SETUP
# ==========================================
try:
    minio_client = Minio(
        "localhost:9000", # The API port (9001 is the web UI)
        access_key="prismadmin",
        secret_key="prismpassword",
        secure=False # Set to False because we are running locally without HTTPS
    )
    print("✅ MinIO Client successfully configured!")
except Exception as e:
    print(f"❌ Failed to configure MinIO: {e}")

def get_minio_client():
    return minio_client