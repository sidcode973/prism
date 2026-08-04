import time
import os
import json
import uuid
from typing import Dict, Any
import traceback
import polars as pl
import s3fs

from prism_ml.agent.router import PrismRouterAgent
from prism_ml.fix.fixer import PrismFixer
from prism_ml.clean.cleaner import PrismCleaner
from prism_ml.feature.engineer import PrismEngineer
from prism_ml.train.trainer import PrismTrainer
from prism_ml.plot.plotter import PrismPlotter
from prism_ml.exceptions import PrismCoreError, TrainingConfigurationError

class PrismDAGExecutor:
    def __init__(self):
        print("⚙️ Booting Enterprise Prism DAG Execution Engine...")
        self.fixer = PrismFixer()
        self.cleaner = PrismCleaner()
        self.engineer = PrismEngineer()
        self.trainer = PrismTrainer()
        self.plotter = PrismPlotter() 
        
        # Cloud Authentication Credentials for Fallback Loading
        self.s3_endpoint = os.getenv("MINIO_ENDPOINT_URL", "http://127.0.0.1:9000")
        self.s3_key = os.getenv("MINIO_ACCESS_KEY", "prismadmin")
        self.s3_secret = os.getenv("MINIO_SECRET_KEY", "prismpassword")

    def _safe_cloud_read(self, file_path: str) -> pl.DataFrame:
        """
        Unified I/O handler. If nodes skip the Cleaner/Engineer, the Orchestrator 
        can safely fetch the cloud data itself.
        """
        is_s3 = file_path.startswith("s3://")
        read_kwargs = {
            "separator": ",",
            "null_values": ["NA", "N/A", "null", "NaN", "?", "", " ", "-", "unknown", "Unknown"],
            "ignore_errors": True,
            "truncate_ragged_lines": True,
        }
        
        if is_s3:
            fs = s3fs.S3FileSystem(
                client_kwargs={'endpoint_url': self.s3_endpoint},
                key=self.s3_key,
                secret=self.s3_secret
            )
            with fs.open(file_path, 'rb') as f:
                file_bytes = f.read()
            return pl.read_csv(file_bytes, **read_kwargs)
        else:
            return pl.read_csv(file_path, **read_kwargs)

    def pre_flight_check(self, nodes: Dict[str, Any], execution_order: list):
        """Scans the graph for fatal user errors BEFORE we spend compute power."""
        actions_in_order = [nodes[node_id]["action_type"] for node_id in execution_order]
        
        if "train_model" in actions_in_order:
            train_idx = actions_in_order.index("train_model")
            
            engineer_idx = actions_in_order.index("feature_engineer") if "feature_engineer" in actions_in_order else -1
            if engineer_idx == -1 or engineer_idx > train_idx:
                raise TrainingConfigurationError(
                    node_id="system_check",
                    message="WARNING: You are attempting to train a model on unencoded data. Please add a 'Feature Engineering' node before 'Train Model' to prevent crashes."
                )
            
            clean_idx = actions_in_order.index("clean_data") if "clean_data" in actions_in_order else -1
            if clean_idx != -1 and clean_idx > engineer_idx:
                raise TrainingConfigurationError(
                    node_id="system_check",
                    message="WARNING: 'Clean Data' must occur before 'Feature Engineering'."
                )

    def execute_graph(self, contract: Dict[str, Any], raw_data_path: str, master_run_id: str) -> Dict[str, Any]:
        """
        Dynamically executes whatever node sequence the user built on the UI.
        """
        print(f"\n🚀 EXECUTING GRAPH FOR USER: {contract['metadata'].get('user_id', 'Unknown')}")
        print(f"🔗 INHERITED MASTER RUN ID: {master_run_id}")
        
        execution_order = contract.get("execution_order", [])
        nodes = {node["node_id"]: node for node in contract.get("nodes", [])}
        
        try:
            self.pre_flight_check(nodes, execution_order)
        except PrismCoreError as e:
            return {"status": "warning", "message": str(e)}

        # ==========================================
        # 2. DUAL-TRACK STATE MANAGEMENT
        # ==========================================
        human_path = raw_data_path 
        human_df = None             
        
        engineered_path = None
        engineered_df = None
        
        results = {}
        
        # Initialize the overarching Master Blueprint
        master_blueprint = {
            "run_id": master_run_id,
            "original_dataset_path": raw_data_path,
            "nodes_executed": execution_order
        }
        
        charts_data = []

        try:
            for node_id in execution_order:
                node = nodes[node_id]
                action = node["action_type"]
                params = node["parameters"]
                
                print(f"▶️ Executing Node: {node_id} ({action})")

                if action == "fix_csv":
                    human_path, structural_blueprint = self.fixer.execute_fix(node_id, human_path, params, master_run_id)
                    human_df = None 
                    results["fixed_data_path"] = human_path
                    master_blueprint.update(structural_blueprint)

                elif action == "clean_data":
                    human_df, human_path, clean_blueprint = self.cleaner.execute_cleaning(node_id, human_path, params, master_run_id)
                    results["cleaned_data_status"] = "success"
                    results["cleaned_data_path"] = human_path
                    master_blueprint.update(clean_blueprint)

                elif action == "feature_engineer":
                    if "column_roles" in master_blueprint:
                        params["column_roles"] = master_blueprint["column_roles"]
                        
                    engineered_df, engineered_path, eng_blueprint = self.engineer.execute_engineering(node_id, human_path, params, master_run_id)
                    results["engineered_data_status"] = "success"
                    results["engineered_data_path"] = engineered_path
                    master_blueprint.update(eng_blueprint)

                elif action == "train_model":
                    if engineered_df is None:
                        if engineered_path is None:
                            raise TrainingConfigurationError(node_id=node_id, message="Engineered data missing. Feature Engineering must run before Training.")
                        engineered_df = self._safe_cloud_read(engineered_path)
                        
                    if "column_roles" in master_blueprint:
                        params["exclude_columns"] = [col for col, role in master_blueprint.get("column_roles", {}).items() if role == "identifier"]
                        
                    model, saved_path, train_blueprint = self.trainer.execute_training(node_id, engineered_df, params, raw_data_path, master_run_id)
                    
                    master_blueprint.update(train_blueprint)
                    
                    meta = train_blueprint.get("__training_metadata__", {})
                    results["best_model"] = meta.get("best_estimator", str(model.best_estimator))
                    
                    # 🛡️ THE BULLETPROOF FLOAT FIREWALL 🛡️
                    raw_score = meta.get("final_score")
                    results["loss"] = float(raw_score) if raw_score is not None else None
                    
                    results["optimization_metric"] = meta.get("metric")
                    results["task_type"] = meta.get("task")
                    results["trained_model_path"] = saved_path

                elif action == "generate_plot":
                    if human_df is None:
                        print("📥 Auto-loading raw/cleaned data for the Plotter...")
                        human_df = self._safe_cloud_read(human_path)

                    plot_data = self.plotter.generate_plot(node_id, human_df, params)
                    charts_data.append(plot_data)
                    
                else:
                    raise PrismCoreError(f"Unknown action type: {action}")

            if charts_data:
                results["charts"] = charts_data

            # ==========================================
            # 3. SAVE THE ARTIFACTS
            # ==========================================
            is_s3 = raw_data_path.startswith("s3://")
            
            if is_s3:
                directory = "/".join(raw_data_path.split("/")[:-1])
                blueprint_path = f"{directory}/inference_blueprint_{master_run_id}.json"
                charts_path = f"{directory}/charts_{master_run_id}.json"
                
                fs = s3fs.S3FileSystem(client_kwargs={'endpoint_url': self.s3_endpoint}, key=self.s3_key, secret=self.s3_secret)
                with fs.open(blueprint_path, 'w') as f:
                    json.dump(master_blueprint, f, indent=4)
                if charts_data:
                    with fs.open(charts_path, 'w') as f:
                        json.dump(charts_data, f, indent=4)
            else:
                dataset_directory = os.path.dirname(raw_data_path)
                blueprint_path = os.path.join(dataset_directory, f"inference_blueprint_{master_run_id}.json")
                charts_path = os.path.join(dataset_directory, f"charts_{master_run_id}.json")
                
                with open(blueprint_path, 'w') as f:
                    json.dump(master_blueprint, f, indent=4)
                if charts_data:
                    with open(charts_path, 'w') as f:
                        json.dump(charts_data, f, indent=4)

            print(f"📜 Master Inference Blueprint saved at: {blueprint_path}")
            
            results["blueprint_path"] = blueprint_path
            results["run_id"] = master_run_id

            return {
                "status": "success",
                "message": "Graph executed successfully.",
                "results": results
            }

        except PrismCoreError as e:
            return {"status": "error", "error_type": "NodeError", "message": str(e)}
        except Exception as e:
            print("\n🚨 SYSTEM CRASH INTERCEPTED! Printing full forensic traceback:")
            traceback.print_exc() 
            print("--------------------------------------------------\n")
            return {"status": "error", "error_type": "SystemCrash", "message": f"Fatal error: {e}"}