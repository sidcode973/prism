# Project Prism 

An open-source, agentic data refinery and AutoML pipeline. 
Project Prism leverages LLM routing, out-of-core data processing, and visual DAGs to automate machine learning feature engineering and model training.

## 🏗️ Architecture

This is a domain-isolated monorepo containing three microservices. For detailed technical information on how each module is implemented and what specific features they provide, please refer to their dedicated documentation files:

1. **[Frontend](FRONTEND_README.md):** Next.js (React Flow + ECharts + Zustand)
2. **[Backend](BACKEND_README.md):** FastAPI (Celery + Redis + PostgreSQL + MinIO)
3. **[Core ML](ML_README.md):** Python (Polars + FLAML + Llama 3 Router)

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