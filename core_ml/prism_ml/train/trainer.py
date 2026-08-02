import os
import polars as pl
from flaml import AutoML
from typing import Dict, Any, Tuple
from prism_ml.exceptions import TrainingConfigurationError
import joblib
import uuid
import pandas as pd
import s3fs
import re

class PrismTrainer:
    def __init__(self):
        print("🧠 Prism AutoML Trainer Initialized")
        self.s3_endpoint = os.getenv("MINIO_ENDPOINT_URL", "http://127.0.0.1:9000")
        self.s3_key = os.getenv("MINIO_ACCESS_KEY", "prismadmin")
        self.s3_secret = os.getenv("MINIO_SECRET_KEY", "prismpassword")

    def _get_filesystem(self) -> s3fs.S3FileSystem:
        return s3fs.S3FileSystem(
            client_kwargs={'endpoint_url': self.s3_endpoint},
            key=self.s3_key,
            secret=self.s3_secret
        )

    def _safe_pandas_conversion(self, df: pl.DataFrame, target_col: str):
        print("🔄 Executing High-Speed Polars-to-Pandas Translation...")
        pdf = df.to_pandas()
        pdf.columns = pdf.columns.astype('object') 
        
        for col in pdf.columns:
            if pd.api.types.is_string_dtype(pdf[col]) or pd.api.types.is_object_dtype(pdf[col]):
                if col != target_col:
                    pdf[col] = pdf[col].astype('category')
                else:
                    pdf[col] = pdf[col].astype(str).astype('object')
        return pdf

    def execute_training(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any], raw_data_path: str) -> Tuple[AutoML, str]:
        raw_target_col = parameters.get("target_column")
        if not raw_target_col:
            raise TrainingConfigurationError(
                node_id=node_id, message="No target column specified."
            )
        
        clean_target = raw_target_col.strip()
        target_col = None
        predicted_schema_name = re.sub(r'[^a-zA-Z0-9_]', '_', clean_target)

        for col in df.columns:
            if col.lower() == clean_target.lower() or col.lower() == predicted_schema_name.lower():
                target_col = col
                break
                
        if not target_col:
            raise TrainingConfigurationError(
                node_id=node_id, message=f"Target column '{clean_target}' not found in the dataset."
            )

        # Actively drop columns flagged for exclusion by Postgres/Engineer
        exclude_cols = parameters.get("exclude_columns", [])
        if exclude_cols:
            df = df.drop([c for c in exclude_cols if c in df.columns], strict=False)

        time_budget = parameters.get("time_budget_seconds", 10) 
        estimator_list = parameters.get("model_family", ["xgboost", "rf", "lgbm"])
        if isinstance(estimator_list, str): estimator_list = [estimator_list]

        pdf = self._safe_pandas_conversion(df, target_col)
        y = pdf[target_col]
        X = pdf.drop(columns=[target_col])

        # ==========================================
        # SMART TASK & METRIC DETECTION
        # Prevents binary classification (like 0/1 integers) from being treated as regression
        # ==========================================
        unique_targets = y.nunique()
        if pd.api.types.is_numeric_dtype(y) and unique_targets > 15:
            task = 'regression'
            metric = 'r2' # R-Squared is universally understood for regression (1.0 is perfect)
        else:
            task = 'classification'
            metric = 'accuracy' # Accuracy is universally understood for classification (1.0 is perfect)

        # Mutate parameters so orchestrator.py can read the explicit metric we chose!
        parameters["task"] = task
        parameters["metric"] = metric

        print(f"🚀 Starting FLAML AutoML. Target: '{target_col}' | Task: {task.upper()} | Budget: {time_budget}s")

        automl = AutoML()
        automl_settings = {
            "time_budget": time_budget,
            "metric": metric,
            "estimator_list": estimator_list,
            "task": task,
            "log_file_name": 'prism_training.log',
            "verbose": 0 
        }

        FLAML_MAP = {
            "random_forest": "rf", "randomforest": "rf", "xg_boost": "xgboost",
            "lightgbm": "lgbm", "gradient_boosting": "lgbm", "logistic_regression": "lrl1",
            "linear_regression": "lrl1", "svm": "svc", "support_vector_machine": "svc"
        }

        if 'estimator_list' in automl_settings:
            raw_list = automl_settings['estimator_list']
            clean_list = [FLAML_MAP.get(est.lower().strip(), est.lower().strip()) for est in (raw_list if isinstance(raw_list, list) else [raw_list])]
            allowed_flaml = ['xgboost', 'xgb_limitdepth', 'rf', 'lgbm', 'lrl1', 'lrl2', 'catboost', 'extra_tree', 'kneighbor']
            final_list = [e for e in clean_list if e in allowed_flaml]
            if final_list: automl_settings['estimator_list'] = final_list
            else: del automl_settings['estimator_list']

        automl.fit(X_train=X, y_train=y, **automl_settings)

        print("\n✅ Training Complete!")
        print(f"🏆 Best Model Found: {automl.best_estimator}")
        
        is_s3 = raw_data_path.startswith("s3://")
        run_id = uuid.uuid4().hex[:8]
        
        if is_s3:
            directory = "/".join(raw_data_path.split("/")[:-1])
            save_path = f"{directory}/trained_model_{run_id}.pkl"
            fs = self._get_filesystem()
            with fs.open(save_path, 'wb') as f:
                joblib.dump(automl, f)
        else:
            dataset_directory = os.path.dirname(raw_data_path)
            save_path = os.path.join(dataset_directory, f"trained_model_{run_id}.pkl")        
            joblib.dump(automl, save_path)
            
        print(f"💾 Model securely saved to destination: {save_path}")
        return automl, save_path