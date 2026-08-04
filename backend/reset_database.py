from connections import Base, engine
from models.database_models import DatasetMetadata, PipelineRun, RunStepMetadata

print("🗑️ Dropping old database tables...")
Base.metadata.drop_all(bind=engine)

print("✨ Recreating fresh tables with the new schema...")
Base.metadata.create_all(bind=engine)

print("✅ Database reset complete!")