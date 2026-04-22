from fastapi import FastAPI, Depends, HTTPException, Security, File, UploadFile # <-- NEW IMPORTS
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.metrics import r2_score, accuracy_score
import os
import shutil # <-- NEW: For saving files
import jwt

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"],
)

# ==========================================
# 1. THE SECURITY BOUNCER
# ==========================================
security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        # We decode the Clerk JWT to grab the user's unique ID
        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        user_id = unverified_payload.get("sub")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
            
        return user_id
        
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token error: {str(e)}")

# ==========================================
# 2. SCHEMAS
# ==========================================
class NodeModel(BaseModel):
    node_id: str
    action_type: str
    parameters: Dict[str, Any]

class DatasetModel(BaseModel):
    file_name: str
    minio_path: str

class PipelineRequest(BaseModel):
    metadata: Dict[str, Any]
    dataset: DatasetModel
    nodes: List[NodeModel]
    execution_order: List[str]

# ==========================================
# 3. THE PROTECTED ML ENGINE
# ==========================================
# ---> Notice the new 'current_user_id' parameter that depends on verify_token! <---
# ==========================================
# 2.5 SECURE FILE UPLOAD
# ==========================================
# ==========================================
# 2.6 LIST SECURE DATASETS
# ==========================================
@app.get("/api/datasets")
async def get_datasets(current_user_id: str = Depends(verify_token)):
    user_folder = os.path.join("data", current_user_id)
    
    # If the user hasn't uploaded anything yet, return an empty list
    if not os.path.exists(user_folder):
        return {"datasets": []}
        
    # Get all the files in their folder
    files = [f for f in os.listdir(user_folder) if os.path.isfile(os.path.join(user_folder, f))]
    return {"datasets": files}

@app.post("/api/datasets/upload")
async def upload_dataset(file: UploadFile = File(...), current_user_id: str = Depends(verify_token)):
    print(f"📥 Receiving file '{file.filename}' from user: {current_user_id}")
    
    # Create a secure, user-specific folder (e.g., data/user_2bX123/)
    user_folder = os.path.join("data", current_user_id)
    os.makedirs(user_folder, exist_ok=True)
    
    file_path = os.path.join(user_folder, file.filename)
    
    # Save the physical file to the disk
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        print(f"✅ Saved securely to {file_path}")
        return {"status": "success", "file_name": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {str(e)}")
@app.post("/api/pipeline/run")
async def run_pipeline(payload: PipelineRequest, current_user_id: str = Depends(verify_token)):
    print("\n" + "="*50)
    print(f"🔒 SECURE REQUEST GRANTED FOR USER: {current_user_id}")
    print(f"🚀 FIRING UP PIPELINE FOR: {payload.dataset.file_name}")
    print("="*50)

    nodes_by_id = {node.node_id: node for node in payload.nodes}
    pipeline_memory = {"dataframe": None, "results": {}}

    try:
        for step_id in payload.execution_order:
            node = nodes_by_id.get(step_id)
            if not node: continue
            
            params = node.parameters
            print(f"\n⚙️ EXECUTING: {node.action_type.upper()}")

            # --- LOAD DATASET ---
            if node.action_type == "load_dataset":
                file_path = os.path.join("data", current_user_id, payload.dataset.file_name)
                print(f"   -> Reading CSV from {file_path}")
                pipeline_memory["dataframe"] = pd.read_csv(file_path)
                print(f"   -> Success! Loaded {len(pipeline_memory['dataframe'])} rows.")

            # --- CLEAN DATA ---
            elif node.action_type == "clean_data":
                df = pipeline_memory["dataframe"]
                strategy = params.get('strategy', 'drop')
                if strategy == 'drop': df = df.dropna()
                elif strategy == 'mean': df = df.fillna(df.mean(numeric_only=True))
                elif strategy == 'median': df = df.fillna(df.median(numeric_only=True))
                pipeline_memory["dataframe"] = df
                print(f"   -> Applied '{strategy}' strategy. Dataset now has {len(df)} rows.")
            # --- PLOT GRAPH ---
            elif node.action_type == "plot_graph":
                df = pipeline_memory["dataframe"]
                x_col = params.get('xAxis')
                y_col = params.get('yAxis')
                chart_type = params.get('type', 'scatter')

                if not x_col or not y_col or x_col not in df.columns or y_col not in df.columns:
                    raise ValueError(f"Missing or invalid columns for graph: '{x_col}' or '{y_col}'")

                print(f"   -> Generating {chart_type} graph for {x_col} vs {y_col}...")
                
                # Take a sample of 100 rows so we don't crash the user's browser
                plot_df = df[[x_col, y_col]].dropna().head(100)
                
                # Convert the dataframe to a list of dictionaries: [{"x": 10, "y": 20}, ...]
                graph_data = plot_df.rename(columns={x_col: "x", y_col: "y"}).to_dict(orient="records")
                
                # Save it to our results payload!
                pipeline_memory["results"]["graphData"] = graph_data
                pipeline_memory["results"]["graphConfig"] = {
                    "xLabel": x_col, 
                    "yLabel": y_col, 
                    "type": chart_type
                }
                print("   -> 📊 Graph data extracted successfully!")    

            # --- TRAIN MODEL ---
            elif node.action_type == "train_model":
                df = pipeline_memory["dataframe"]
                target = params.get('target')
                split = int(params.get('split', 20)) / 100.0

                if not target or target not in df.columns:
                    raise ValueError(f"Target column '{target}' missing from dataset!")

                print(f"   -> Preparing features and predicting '{target}'...")
                numeric_df = df.select_dtypes(include=['number'])
                X = numeric_df.drop(columns=[target])
                y = numeric_df[target]

                X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=split, random_state=42)

                print("   -> Training Random Forest Model...")
                if y.nunique() > 20:
                    model = RandomForestRegressor(random_state=42)
                    model.fit(X_train, y_train)
                    score = r2_score(y_test, model.predict(X_test))
                    metric = "R² Score"
                else:
                    model = RandomForestClassifier(random_state=42)
                    model.fit(X_train, y_train)
                    score = accuracy_score(y_test, model.predict(X_test))
                    metric = "Accuracy"

                final_score_percentage = round(score * 100, 2)
                pipeline_memory["results"]["score"] = f"{final_score_percentage}%"
                pipeline_memory["results"]["metric"] = metric
                print(f"   -> 🎯 MODEL TRAINED! {metric}: {final_score_percentage}%")

    except Exception as e:
        print(f"❌ PIPELINE CRASHED AT {node.action_type}: {str(e)}")
        return {"status": "error", "message": str(e), "failed_node": step_id}

    print("\n✅ PIPELINE EXECUTION COMPLETE!")
    print("="*50 + "\n")
    
    return {
        "status": "success", 
        "message": "Pipeline ran perfectly.",
        "results": pipeline_memory["results"]
    }