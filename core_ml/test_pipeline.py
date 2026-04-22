import json
from prism_ml.profile.profiler import PrismProfiler
from prism_ml.agent.router import PrismRouterAgent
from prism_ml.orchestrator import PrismDAGExecutor

if __name__ == "__main__":
    print("=== PROJECT PRISM: MASTER PIPELINE TEST ===\n")
    
    profiler = PrismProfiler()
    agent = PrismRouterAgent()
    executor = PrismDAGExecutor()
    
    file_path = "dummy_data.csv"
    
    # We use a broad prompt to trigger the "Senior Data Scientist" agentic rules
    user_prompt = "Clean this dataset, visualize the correlations and a scatter plot, and then train an xgboost model to predict Salary."    
    try:
        # 1. Profile
        print("--- [1] PROFILING DATA ---")
        profile = profiler.generate_profile(file_path)
        
        # 2. Route
        print("\n--- [2] AI ROUTING (Llama 3) ---")
        contract_str = agent.generate_contract(
            user_prompt=user_prompt, 
            user_id="usr_bhavya_01", 
            project_id="prj_alpha", 
            file_name=file_path, 
            data_profile=profile
        )
        contract = json.loads(contract_str)
        
        print(f"🧠 AI decided to run these nodes: {contract['execution_order']}")
        print(f"📄 Clean Data Parameters Generated: {json.dumps(contract['nodes'][0]['parameters'], indent=2)}")
        
        # 3. Execute
        print("\n--- [3] EXECUTING DAG ---")
        final_response = executor.execute_graph(contract, file_path)
        
        # Print a clean summary for the frontend
        print("\n✅ FINAL PAYLOAD SUMMARY:")
        if final_response["status"] == "success":
            results = final_response.get("results", {})
            if "cleaned_data" in results:
                print(" - Data successfully cleaned and loaded into memory!")
            if "charts" in results:
                print(f" - Generated {len(results['charts'])} charts for the UI:")
                for chart in results['charts']:
                    print(f"    📊 [{chart['chart_type'].upper()}] {chart['title']}")
        else:
            print(f"⚠️ Engine Warning: {final_response['message']}")

    except Exception as e:
        print(f"\n🚨 TEST CRASHED: {e}")