# Project Prism 

An open-source, agentic data refinery and AutoML pipeline. 
Project Prism leverages LLM routing, out-of-core data processing, and visual DAGs to automate machine learning feature engineering and model training.

## 🏗️ Architecture

This is a domain-isolated monorepo containing three microservices:
1. **Frontend:** Next.js (React Flow + ECharts + Zustand)
2. **Backend:** FastAPI (Celery + Redis + PostgreSQL)
3. **Core ML:** Python (Polars + FLAML + SHAP + Groq)

---

## 🚀 Local Development Setup

### 1. Frontend (Bhavya Shah)
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

### 2. Backend (Shubhra Jyoti)
```bash
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
fastapi dev main.py
# Runs on http://localhost:8000
```

### 3. ML Core (Bhavya Doriya)
```bash
cd core_ml
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Code is executed via the backend Celery workers
```