import json
from prism_ml.profile.profiler import PrismProfiler
from prism_ml.agent.router import PrismRouterAgent
from prism_ml.clean.cleaner import PrismCleaner
from prism_ml.train.trainer import PrismTrainer

if __name__ == "__main__":
    print("=== PROJECT PRISM: AUTONOMOUS AGENT TEST ===\n")
    
    # 1. The minimal human prompt (No dropping instructions!)
    test_prompt = "Build an xgboost model to predict Salary for me."
    file_name = "dummy_data.csv"
    
    try:
        # --- STAGE 0: PROFILING (The Eyes) ---
        print("--- STAGE 0: PROFILING ---")
        profiler = PrismProfiler()
        schema_profile = profiler.generate_profile(file_name)
        print(schema_profile)
        
        # --- STAGE 1: AGENTIC ROUTING (The Brain) ---
        print("\n--- STAGE 1: AI CONTRACT GENERATION ---")
        agent = PrismRouterAgent()
        json_string = agent.generate_contract(
            user_prompt=test_prompt,
            user_id="usr_bhavya_01",
            project_id="prj_alpha",
            file_name=file_name,
            data_profile=schema_profile # Passing the Eyes to the Brain!
        )
        
        print("\n🧠 AI Generated Contract:")
        print(json_string)
        
        # Parse the JSON string back into a dictionary for the Muscle
        contract_dict = json.loads(json_string)
        clean_params = contract_dict["nodes"][0]["parameters"]
        train_params = contract_dict["nodes"][1]["parameters"]

        # --- STAGE 2: CLEANING (The Muscle) ---
        print("\n--- STAGE 2: CLEANING ---")
        cleaner = PrismCleaner()
        cleaned_df = cleaner.execute_cleaning(
            node_id="step_1_clean",
            file_path=file_name,
            parameters=clean_params
        )
        print("\nCleaned Data Preview:")
        print(cleaned_df.head(5))
        
        # --- STAGE 3: TRAINING (The Muscle) ---
        print("\n--- STAGE 3: TRAINING ---")
        trainer = PrismTrainer()
        best_model = trainer.execute_training(
            node_id="step_2_train",
            df=cleaned_df,
            parameters=train_params
        )
        
    except Exception as e:
        print(f"\n❌ PIPELINE CRASHED: {e}")