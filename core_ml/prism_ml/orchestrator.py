import time
import os
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
            "quote_char": None  # <--- THE MISSING MAGIC SHIELD
        }
        
        if is_s3:
            # THE FIX: Decapitate Polars' S3 engine and read bytes natively
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
            
            # 1. Feature Engineering must exist and precede Training
            engineer_idx = actions_in_order.index("feature_engineer") if "feature_engineer" in actions_in_order else -1
            if engineer_idx == -1 or engineer_idx > train_idx:
                raise TrainingConfigurationError(
                    node_id="system_check",
                    message="WARNING: You are attempting to train a model on unencoded data. Please add a 'Feature Engineering' node before 'Train Model' to prevent crashes."
                )
            
            # 2. Cleaner must exist and precede Feature Engineering (if both are present)
            clean_idx = actions_in_order.index("clean_data") if "clean_data" in actions_in_order else -1
            if clean_idx != -1 and clean_idx > engineer_idx:
                raise TrainingConfigurationError(
                    node_id="system_check",
                    message="WARNING: 'Clean Data' must occur before 'Feature Engineering'."
                )

    def execute_graph(self, contract: Dict[str, Any], raw_data_path: str) -> Dict[str, Any]:
        """
        Dynamically executes whatever node sequence the user built on the UI.
        """
        print(f"\n🚀 EXECUTING GRAPH FOR USER: {contract['metadata'].get('user_id', 'Unknown')}")
        
        execution_order = contract.get("execution_order", [])
        nodes = {node["node_id"]: node for node in contract.get("nodes", [])}
        
        # 1. Run Pre-Flight Check
        try:
            self.pre_flight_check(nodes, execution_order)
        except PrismCoreError as e:
            return {"status": "warning", "message": str(e)}

        # 2. The Relay Race States
        current_path = raw_data_path  # Always points to the most recently saved file
        current_df = None             # Holds the loaded Polars DataFrame
        results = {}

        try:
            for node_id in execution_order:
                node = nodes[node_id]
                action = node["action_type"]
                params = node["parameters"]
                
                print(f"▶️ Executing Node: {node_id} ({action})")

                if action == "fix_csv":
                    current_path = self.fixer.execute_fix(node_id, current_path, params)
                    current_df = None # Invalidate the DF since the file just changed
                    results["fixed_data_path"] = current_path

                elif action == "clean_data":
                    current_df, current_path = self.cleaner.execute_cleaning(node_id, current_path, params)
                    results["cleaned_data_status"] = "success"
                    results["cleaned_data_path"] = current_path

                elif action == "feature_engineer":
                    current_df, current_path = self.engineer.execute_engineering(node_id, current_path, params)
                    results["engineered_data_status"] = "success"
                    results["engineered_data_path"] = current_path

                elif action == "train_model":
                    if current_df is None:
                        # THE FIX: Safely route through the new unified Cloud I/O method
                        current_df = self._safe_cloud_read(current_path)
                        
                    model, saved_path = self.trainer.execute_training(node_id, current_df, params, raw_data_path)
                    results["best_model"] = str(model.best_estimator)
                    results["loss"] = model.best_loss
                    results["trained_model_path"] = saved_path

                elif action == "generate_plot":
                    if current_df is None:
                        print("📥 Auto-loading raw data for the Plotter...")
                        # THE FIX: Safely route through the new unified Cloud I/O method
                        current_df = self._safe_cloud_read(current_path)

                    plot_data = self.plotter.generate_plot(node_id, current_df, params)
                    
                    if "charts" not in results:
                        results["charts"] = []
                    results["charts"].append(plot_data)
                    
                else:
                    raise PrismCoreError(f"Unknown action type: {action}")

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