import os
import json
import joblib
import s3fs
import pandas as pd
import numpy as np
from typing import Dict, Any

class PrismPredictor:
    def __init__(self):
        print("🔮 Prism Inference Engine Initialized")
        self.s3_endpoint = os.getenv("MINIO_ENDPOINT_URL", "http://127.0.0.1:9000")
        self.s3_key = os.getenv("MINIO_ACCESS_KEY", "prismadmin")
        self.s3_secret = os.getenv("MINIO_SECRET_KEY", "prismpassword")

    def _get_filesystem(self) -> s3fs.S3FileSystem:
        return s3fs.S3FileSystem(
            client_kwargs={'endpoint_url': self.s3_endpoint},
            key=self.s3_key,
            secret=self.s3_secret
        )

    def predict(self, input_data: Dict[str, Any], blueprint_path: str, model_path: str) -> Dict[str, Any]:
        """
        Transforms a raw JSON payload into an ML-ready matrix using the saved blueprint, 
        then executes the prediction.
        """
        fs = self._get_filesystem()
        
        # 1. Load Artifacts from Vault (MinIO)
        try:
            with fs.open(blueprint_path, 'r') as f:
                blueprint = json.load(f)
                
            with fs.open(model_path, 'rb') as f:
                model = joblib.load(f)
        except Exception as e:
            raise RuntimeError(f"Failed to load model artifacts from cloud storage: {e}")

        # 2. Convert raw input dict to Pandas DataFrame (best for single-row manipulation)
        df = pd.DataFrame([input_data])
        
        # ==========================================
        # 3. APPLY CLEANING PHASE (Imputations)
        # ==========================================
        imputations = blueprint.get("__imputations__", {})
        for col, rules in imputations.items():
            if col not in df.columns or pd.isna(df.get(col, pd.Series([None]))).iloc[0] or str(df.get(col).iloc[0]).strip() == "":
                df[col] = rules.get("fill_value")

        # ==========================================
        # 4. APPLY ENGINEERING PHASE
        # ==========================================
        
        # A. Date Decompositions
        date_cols = blueprint.get("__date_decompositions__", [])
        for col in date_cols:
            if col in df.columns:
                dt_series = pd.to_datetime(df[col], errors='coerce')
                df[f"{col}_year"] = dt_series.dt.year
                df[f"{col}_month"] = dt_series.dt.month
                df[f"{col}_day"] = dt_series.dt.day
                df[f"{col}_dayofweek"] = dt_series.dt.dayofweek
                df = df.drop(columns=[col])

        # B. Categorical One-Hot Encoding (OHE)
        # Instead of get_dummies(), we explicitly map to the exact columns the model expects
        ohe_mappings = blueprint.get("__ohe_mappings__", {})
        for col, allowed_cats in ohe_mappings.items():
            if col in df.columns:
                val = str(df[col].iloc[0])
                for cat in allowed_cats:
                    # In Pandas get_dummies, the default format is "colname_category"
                    dummy_col_name = f"{col}_{cat}"
                    df[dummy_col_name] = 1 if val == str(cat) else 0
                
                # Handle high-cardinality "Other" fallback if it was generated
                if "Other" in allowed_cats:
                    df[f"{col}_Other"] = 1 if val not in [str(c) for c in allowed_cats] else 0
                    
                df = df.drop(columns=[col])

        # C. Feature Scaling
        scaling = blueprint.get("__scaling_params__", {})
        scale_method = scaling.get("method", "none")
        scale_params = scaling.get("params", {})
        
        if scale_method == "standard":
            for col, stats in scale_params.items():
                if col in df.columns:
                    mean_val = stats["mean"]
                    std_val = stats["std"]
                    df[col] = (pd.to_numeric(df[col], errors='coerce').fillna(0) - mean_val) / std_val
        
        elif scale_method == "minmax":
            for col, stats in scale_params.items():
                if col in df.columns:
                    c_min = stats["min"]
                    c_max = stats["max"]
                    rng = c_max - c_min if (c_max - c_min) != 0 else 1.0
                    df[col] = (pd.to_numeric(df[col], errors='coerce').fillna(0) - c_min) / rng

        # D. Clean Column Names (re.sub logic from engineer.py)
        rename_map = blueprint.get("__column_rename_map__", {})
        if rename_map:
            df = df.rename(columns=rename_map)

        # ==========================================
        # 5. MATRIX ALIGNMENT
        # ==========================================
        # We must mathematically align our 1-row DataFrame to match the exact 
        # columns (and order) the XGBoost/RF/FLAML model trained on.
        training_metadata = blueprint.get("__training_metadata__", {})
        feature_names = training_metadata.get("feature_names", [])
        
        if not feature_names:
            raise ValueError("Inference failed: Blueprint missing 'feature_names' in training metadata.")

        # Reindex automatically drops extra columns (like Target) and adds missing OHE dummies as NaNs
        df = df.reindex(columns=feature_names)
        # Fill missing OHE dummy columns with 0
        df = df.fillna(0) 

        # ==========================================
        # 6. EXECUTE PREDICTION
        # ==========================================
        prediction = model.predict(df)
        
        # Serialize numpy types to native Python types for FastAPI JSON response
        pred_val = prediction[0]
        if isinstance(pred_val, (np.float32, np.float64, float)):
            result = {"prediction": float(pred_val)}
        elif isinstance(pred_val, (np.int32, np.int64, int)):
            result = {"prediction": int(pred_val)}
        else:
            result = {"prediction": str(pred_val)}
            
        # Extract Probability / Confidence if classification model
        try:
            if hasattr(model, "predict_proba"):
                proba_array = model.predict_proba(df)
                result["confidence"] = round(float(np.max(proba_array[0])), 4)
        except Exception:
            pass # Regression models won't have predict_proba
            
        return result