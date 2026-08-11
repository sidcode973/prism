# System Architecture

This document provides a high-level overview of the **Project Prism** architecture, its directory structure, and the data flow between microservices. 

Prism is designed as a decoupled, asynchronous machine learning pipeline engine. It separates lightweight API orchestration from heavy ML background tasks and hybrid storage solutions.

---

## 📂 Project Structure

```text
project-prism/
├── docker-compose.yml       # Infrastructure orchestration
├── docs/assets/             # Project diagrams and visual assets
│
├── frontend/                # Next.js 16 UI Application
│   ├── src/
│   │   ├── app/
│   │   │   ├── canvas/      # React Flow pipeline builder
│   │   │   │   ├── components/ 
│   │   │   │   │   ├── NeoNode.tsx      # Custom draggable nodes
│   │   │   │   │   ├── ResultsModal.tsx # Interactive ECharts & exports
│   │   │   │   │   └── Sidebar.tsx      # Config and node selection
│   │   │   │   └── page.tsx
│   │   │   ├── history/     # Historical run dashboard
│   │   │   ├── sign-in/     # Clerk Auth routing
│   │   │   └── page.tsx     # Landing dashboard
│   │   └── proxy.ts
│   ├── package.json
│   └── Dockerfile
│
├── backend/                 # FastAPI & Celery Task Routing
│   ├── main.py              # API Gateway & Route Handlers
│   ├── connections.py       # DB (Postgres) & S3 (MinIO) client init
│   ├── celery_worker.py     # Background task consumer setup
│   ├── requirements.txt
│   └── Dockerfile
│
└── core_ml/                 # The Machine Learning Engine
    ├── prism_ml/
    │   ├── agent/router.py        # LLM prompt routing & logic
    │   ├── clean/cleaner.py       # Polars-based null/duplicate handling
    │   ├── feature/engineer.py    # Scaling & One-Hot Encoding
    │   ├── fix/fixer.py           # LLM-assisted structural CSV repair
    │   ├── inference/predictor.py # Live model testing logic
    │   ├── plot/plotter.py        # ECharts JSON payload generator
    │   ├── profile/profiler.py    # Dataset metadata extraction
    │   ├── report/reporter.py     # Pipeline summary generation
    │   ├── train/trainer.py       # FLAML AutoML execution
    │   └── orchestrator.py        # DAG execution sequence manager
    ├── pyproject.toml
    └── requirements.txt
```

---

## Service Topology

Prism relies on 6 distinct Docker containers working in harmony:

1. **Frontend (Next.js):** Handles user auth (Clerk), renders the React Flow canvas, and visualizes the ML results (ECharts). It communicates exclusively with the FastAPI Gateway.
2. **Backend Gateway (FastAPI):** The traffic cop. It validates incoming JSON payloads using Pydantic, writes lightweight metadata to Postgres, and offloads heavy processing to Celery.
3. **Task Queue (Redis):** The message broker. FastAPI drops tasks (like "Train Model") into Redis, and Celery picks them up.
4. **Task Worker (Celery):** The heavy lifter. Runs the `core_ml/prism_ml` Python scripts asynchronously so the web API never freezes.
5. **Relational Database (PostgreSQL):** Stores fast, queryable metadata (e.g., user IDs, model names, execution scores) for the History Dashboard.
6. **Object Storage (MinIO):** An S3-compatible data lake. Stores massive binary artifacts: raw CSVs, cleaned CSVs, encoded matrices, and exported `.pkl` models.

---

## Data Execution Flow

When a user clicks **"Run Pipeline"** on the canvas, the following sequence triggers:

### 1. Ingestion & Storage
* The frontend intercepts the user's uploaded `.csv` file.
* FastAPI streams the file directly into the **MinIO** `prism-datasets` bucket.
* FastAPI records a new entry in **PostgreSQL** with a unique `run_id`.

### 2. The Asynchronous Hand-off
* FastAPI generates a JSON blueprint of the user's canvas (the DAG).
* FastAPI sends this DAG to **Redis**, enqueuing a Celery job.
* FastAPI immediately returns a `202 Accepted` response to the frontend, which triggers the loading screen.

### 3. Pipeline Execution (Celery + Core ML Orchestrator)
The Celery worker triggers `orchestrator.py`, which executes the nodes sequentially based on the DAG:
* **Fix Node (`fixer.py`):** Pulls the CSV from MinIO, sends a sample to the Groq LLM to detect delimiters, rebuilds the CSV row-by-row, and saves `structurally_fixed.csv` back to MinIO.
* **Clean Node (`cleaner.py`):** Loads the file into Polars, drops nulls/duplicates, applies smart type coercion, and saves `cleaned.csv`.
* **Plot Node (`plotter.py`):** Generates correlation and distribution matrices, outputting massive ECharts JSON payloads.
* **Train Node (`trainer.py`):** FLAML ingests the final matrix, trains the optimal model within the time budget, and exports `model.pkl` and `inference_blueprint.json` to MinIO.

### 4. Resolution
* Celery updates the PostgreSQL record status to `COMPLETED`.
* The frontend, which has been polling FastAPI, detects the completion.
* The frontend fetches the URLs for the artifacts from MinIO and renders the **Results Dashboard** with downloadable assets and live ECharts.