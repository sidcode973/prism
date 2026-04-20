from prism_ml.clean.cleaner import PrismCleaner
from prism_ml.train.trainer import PrismTrainer

if __name__ == "__main__":
    print("=== PROJECT PRISM: END-TO-END MUSCLE TEST ===\n")
    
    # 1. The Mock Contracts (What the LLM would generate)
    clean_params = {
        "drop_columns": ["Address", "ID", "Name"], # Dropping Name too, as AI can't train on random names yet
        "impute_strategy": "median"
    }
    
    train_params = {
        "target_column": "Salary", # We want to predict their Salary!
        "time_budget_seconds": 3,  # Just 3 seconds for a quick test
        "model_family": ["xgboost", "rf"]
    }
    
    try:
        # --- STAGE 1: CLEANING ---
        print("--- STAGE 1: CLEANING ---")
        cleaner = PrismCleaner()
        cleaned_df = cleaner.execute_cleaning(
            node_id="step_1_clean",
            file_path="dummy_data.csv",
            parameters=clean_params
        )
        print("\nCleaned Data Preview:")
        print(cleaned_df)
        
        # --- STAGE 2: TRAINING ---
        print("\n--- STAGE 2: TRAINING ---")
        trainer = PrismTrainer()
        best_model = trainer.execute_training(
            node_id="step_2_train",
            df=cleaned_df,
            parameters=train_params
        )
        
    except Exception as e:
        print(f"\n❌ PIPELINE CRASHED: {e}")