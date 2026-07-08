import time
from typing import Dict, Any

from prism_ml.agent.router import PrismRouterAgent
from prism_ml.clean.cleaner import PrismCleaner
from prism_ml.train.trainer import PrismTrainer
from prism_ml.exceptions import PrismCoreError, TrainingConfigurationError
from prism_ml.plot.plotter import PrismPlotter
import traceback
class PrismDAGExecutor:
    def __init__(self):
        print("⚙️ Booting Prism DAG Execution Engine...")
        self.cleaner = PrismCleaner()
        self.trainer = PrismTrainer()
        self.plotter = PrismPlotter() 

    def pre_flight_check(self, nodes: Dict[str, Any], execution_order: list):
        """Scans the graph for fatal user errors BEFORE we spend compute power."""
        actions_in_order = [nodes[node_id]["action_type"] for node_id in execution_order]
        
        if "train_model" in actions_in_order:
            train_idx = actions_in_order.index("train_model")
            clean_idx = actions_in_order.index("clean_data") if "clean_data" in actions_in_order else -1
            
            # If train exists, but clean doesn't exist, or clean happens AFTER train
            if clean_idx == -1 or clean_idx > train_idx:
                raise TrainingConfigurationError(
                    node_id="system_check",
                    message="WARNING: You are attempting to train a model on uncleaned data. Please add a 'Clean Data' node before 'Train Model' to prevent crashes."
                )

    def execute_graph(self, contract: Dict[str, Any], raw_data_path: str) -> Dict[str, Any]:
        """
        Dynamically executes whatever node sequence the user built on the UI.
        """
        print(f"\n🚀 EXECUTING GRAPH FOR USER: {contract['metadata']['user_id']}")
        
        execution_order = contract.get("execution_order", [])
        nodes = {node["node_id"]: node for node in contract.get("nodes", [])}
        
        # 1. Run Pre-Flight Check
        try:
            self.pre_flight_check(nodes, execution_order)
        except PrismCoreError as e:
             return {"status": "warning", "message": str(e)}

        # 2. Dynamic Execution Loop
        current_data = raw_data_path # Data flows from node to node
        results = {}

        try:
            for node_id in execution_order:
                node = nodes[node_id]
                action = node["action_type"]
                params = node["parameters"]
                
                print(f"▶️ Executing Node: {node_id} ({action})")

                if action == "clean_data":
                    # Cleaner takes raw data path, outputs a Polars DF
                    current_data, saved_path = self.cleaner.execute_cleaning(node_id, current_data, params)
                    results["cleaned_data_status"] = "success"
                    # Put the unique path in the payload for Shubhra!
                    results["cleaned_data_path"] = saved_path

                elif action == "train_model":
                    # Catch the tuple!
                    model, saved_path = self.trainer.execute_training(node_id, current_data, params, raw_data_path)
                    results["best_model"] = str(model.best_estimator)
                    results["loss"] = model.best_loss
                    # Put the unique path in the payload for Shubhra!
                    results["trained_model_path"] = saved_path
                elif action == "generate_plot":
                    import polars as pl
                    
                    # ---> THE FIX: Auto-load data if the user skipped the Clean step <---
                    if isinstance(current_data, str):
                        print("📥 Auto-loading raw data for the Plotter...")
                        current_data = pl.read_csv(current_data, null_values=["NA", "N/A", "null", "NaN", "?", "", " "])

                    # Hand the Polars dataframe to the charting engine
                    plot_data = self.plotter.generate_plot(node_id, current_data, params)
                    
                    # Store multiple charts in an array for Bhavya Shah's frontend
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
            # Deterministic errors (Missing columns, bad math) - Return immediately to user
            return {"status": "error", "error_type": "NodeError", "message": str(e)}
        except Exception as e:
            print("\n🚨 SYSTEM CRASH INTERCEPTED! Printing full forensic traceback:")
            traceback.print_exc() 
            print("--------------------------------------------------\n")
            
            return {"status": "error", "error_type": "SystemCrash", "message": f"Fatal error: {e}"}