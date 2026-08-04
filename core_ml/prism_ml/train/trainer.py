import os
import re
import joblib
import s3fs
import pandas as pd
import polars as pl
from typing import Dict, Any, Tuple
from flaml import AutoML
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    r2_score, accuracy_score, mean_absolute_error, 
    mean_squared_error, f1_score
)
from prism_ml.exceptions import TrainingConfigurationError

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

    def _safe_pandas_conversion(self, df: pl.DataFrame, target_col: str) -> pd.DataFrame:
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

    def _calculate_test_score(self, y_test, y_pred, metric: str, task: str) -> float:
        metric = metric.lower().strip()
        try:
            if metric == 'r2':
                return float(r2_score(y_test, y_pred))
            elif metric in ['mae', 'mean_absolute_error']:
                return float(mean_absolute_error(y_test, y_pred))
            elif metric in ['rmse', 'mse']:
                mse_val = mean_squared_error(y_test, y_pred)
                return float(mse_val ** 0.5) if metric == 'rmse' else float(mse_val)
            elif metric == 'accuracy':
                return float(accuracy_score(y_test, y_pred))
            elif metric in ['f1', 'f1_weighted']:
                return float(f1_score(y_test, y_pred, average='weighted'))
            else:
                return float(r2_score(y_test, y_pred)) if task == 'regression' else float(accuracy_score(y_test, y_pred))
        except Exception as e:
            print(f"⚠️ Metric calculation failed for {metric} (Task: {task}): {e}")
            return float(r2_score(y_test, y_pred)) if task == 'regression' else float(accuracy_score(y_test, y_pred))

    def execute_training(
        self, 
        node_id: str, 
        df: pl.DataFrame, 
        parameters: Dict[str, Any], 
        raw_data_path: str,
        run_id: str,
        master_blueprint: Dict[str, Any] = None # Added blueprint access!
    ) -> Tuple[AutoML, str, dict]:
        
        raw_target_col = parameters.get("target_column")
        if not raw_target_col:
            raise TrainingConfigurationError(node_id=node_id, message="No target column specified for training.")
        
        clean_target = raw_target_col.strip()
        target_col = None
        predicted_schema_name = re.sub(r'[^a-zA-Z0-9_]', '_', clean_target)

        for col in df.columns:
            if col.lower() == clean_target.lower() or col.lower() == predicted_schema_name.lower():
                target_col = col
                break
                
        if not target_col:
            raise TrainingConfigurationError(node_id=node_id, message=f"Target column '{clean_target}' not found in the dataset matrix.")

        exclude_cols = parameters.get("exclude_columns", [])
        if exclude_cols:
            df = df.drop([c for c in exclude_cols if c in df.columns], strict=False)

        time_budget = parameters.get("time_budget_seconds", 10) 
        estimator_list = parameters.get("model_family", ["xgboost", "rf", "lgbm"])
        if isinstance(estimator_list, str): 
            estimator_list = [estimator_list]

        pdf = self._safe_pandas_conversion(df, target_col)
        y = pdf[target_col]
        X = pdf.drop(columns=[target_col])

        user_task = parameters.get("task")
        user_metric = parameters.get("metric")

        if user_task:
            task = user_task.lower().strip()
        else:
            unique_targets = y.nunique()
            if pd.api.types.is_numeric_dtype(y) and unique_targets > 15:
                task = 'regression'
            else:
                task = 'classification'

        if user_metric and str(user_metric).lower().strip() != 'auto':
            metric = str(user_metric).lower().strip()
            print(f"👤 Manual evaluation metric selected: '{metric.upper()}' (Task: {task.upper()})")
        else:
            metric = 'r2' if task == 'regression' else 'accuracy'
            print(f"🤖 Auto-detected metric: '{metric.upper()}' (Task: {task.upper()})")

        parameters["task"] = task
        parameters["metric"] = metric

        test_split_ratio = float(parameters.get("test_split_ratio", 0.0))
        test_dataset_path = parameters.get("test_dataset_path")
        is_test_s3 = str(test_dataset_path).startswith("s3://")

        if test_dataset_path and (is_test_s3 or os.path.exists(test_dataset_path)):
            print(f"🧪 Evaluating against external test set: {test_dataset_path}")
            X_train, y_train = X, y
            
            if is_test_s3:
                fs = self._get_filesystem()
                with fs.open(test_dataset_path, 'rb') as f:
                    file_bytes = f.read()
                test_df_raw = pl.read_csv(file_bytes, ignore_errors=True)
            else:
                test_df_raw = pl.read_csv(test_dataset_path, ignore_errors=True)

            test_pdf = test_df_raw.to_pandas()

            # ==========================================
            # 🔮 BULK TEST SET BLUEPRINT TRANSFORMATION
            # ==========================================
            print("⚙️ Applying Blueprint Math to External Test Set...")
            y_test = test_pdf[clean_target] if clean_target in test_pdf.columns else None
            
            if master_blueprint:
                # 1. Imputations
                for col, rules in master_blueprint.get("__imputations__", {}).items():
                    if col in test_pdf.columns:
                        test_pdf[col] = test_pdf[col].fillna(rules.get("fill_value"))

                # 2. Date Decomposition
                for col in master_blueprint.get("__date_decompositions__", []):
                    if col in test_pdf.columns:
                        dt_series = pd.to_datetime(test_pdf[col], errors='coerce')
                        test_pdf[f"{col}_year"] = dt_series.dt.year
                        test_pdf[f"{col}_month"] = dt_series.dt.month
                        test_pdf[f"{col}_day"] = dt_series.dt.day
                        test_pdf[f"{col}_dayofweek"] = dt_series.dt.dayofweek
                        test_pdf = test_pdf.drop(columns=[col])

                # 3. Explicit OHE Mapping
                for col, allowed_cats in master_blueprint.get("__ohe_mappings__", {}).items():
                    if col in test_pdf.columns:
                        for cat in allowed_cats:
                            test_pdf[f"{col}_{cat}"] = (test_pdf[col].astype(str) == str(cat)).astype(int)
                        if "Other" in allowed_cats:
                            test_pdf[f"{col}_Other"] = (~test_pdf[col].astype(str).isin([str(c) for c in allowed_cats])).astype(int)
                        test_pdf = test_pdf.drop(columns=[col])

                # 4. Feature Scaling
                scaling = master_blueprint.get("__scaling_params__", {})
                if scaling.get("method") == "standard":
                    for col, stats in scaling.get("params", {}).items():
                        if col in test_pdf.columns:
                            test_pdf[col] = (pd.to_numeric(test_pdf[col], errors='coerce').fillna(0) - stats["mean"]) / stats["std"]
                elif scaling.get("method") == "minmax":
                    for col, stats in scaling.get("params", {}).items():
                        if col in test_pdf.columns:
                            rng = stats["max"] - stats["min"] if (stats["max"] - stats["min"]) != 0 else 1.0
                            test_pdf[col] = (pd.to_numeric(test_pdf[col], errors='coerce').fillna(0) - stats["min"]) / rng

                # 5. Column Rename Mapping
                rename_map = master_blueprint.get("__column_rename_map__", {})
                if rename_map:
                    test_pdf = test_pdf.rename(columns=rename_map)

            # Mathematically forces test columns to perfectly match X_train
            X_test = test_pdf.reindex(columns=X_train.columns, fill_value=0)
            evaluation_mode = "explicit_test_set"

        elif test_split_ratio > 0.0 and test_split_ratio < 1.0:
            print(f"🪓 Splitting Dataset: {int((1-test_split_ratio)*100)}% Train / {int(test_split_ratio*100)}% Hold-out Test")
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_split_ratio, random_state=42
            )
            evaluation_mode = f"holdout_{int(test_split_ratio*100)}_pct"

        else:
            print("🔄 Using 100% data with FLAML Internal Cross-Validation")
            X_train, y_train = X, y
            X_test, y_test = None, None
            evaluation_mode = "cross_validation"

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
            if final_list: 
                automl_settings['estimator_list'] = final_list
            else: 
                del automl_settings['estimator_list']

        automl.fit(X_train=X_train, y_train=y_train, **automl_settings)

        if X_test is not None and y_test is not None:
            try:
                y_pred = automl.predict(X_test)
                verified_score = self._calculate_test_score(y_test, y_pred, metric, task)
            except Exception as e:
                print(f"⚠️ Prediction on holdout set failed, falling back to CV loss: {e}")
                raw_loss = automl.best_loss
                verified_score = float(1.0 - raw_loss) if metric in ["r2", "accuracy"] else float(raw_loss)
        else:
            raw_loss = automl.best_loss
            if metric in ["r2", "accuracy"]:
                verified_score = float(1.0 - raw_loss)
            else:
                verified_score = float(raw_loss)

        print("\n✅ Training Complete!")
        print(f"🏆 Best Model Found: {automl.best_estimator}")
        print(f"🎯 Verified Score ({metric.upper()}): {verified_score:.4f} [Mode: {evaluation_mode}]")

        is_s3 = raw_data_path.startswith("s3://")
        
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

        training_blueprint = {
            "__training_metadata__": {
                "best_estimator": str(automl.best_estimator),
                "task": task,
                "metric": metric,
                "final_score": verified_score,
                "evaluation_mode": evaluation_mode,
                "target_column": target_col,
                "feature_names": list(X.columns),
                "model_artifact_path": save_path
            }
        }
            
        print(f"💾 Model securely saved to destination: {save_path}")
        return automl, save_path, training_blueprint