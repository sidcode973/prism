# PROJECT PRISM

> **The Autonomous & Interactive Drag-and-Drop Machine Learning Pipeline Engine**

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)
![Polars](https://img.shields.io/badge/Data-Polars-CD792C?logo=polars)
![FLAML](https://img.shields.io/badge/AutoML-FLAML-0052CC)
![Docker](https://img.shields.io/badge/Deployment-Docker%20Compose-2496ED?logo=docker)
![Celery](https://img.shields.io/badge/Task%20Queue-Celery%20%26%20Redis-37814A?logo=celery)
![MinIO](https://img.shields.io/badge/Storage-MinIO%20S3-C72C48?logo=minio)

---

## Demo & Visual Overview

<div align="center">
  <img src="docs/assets/logo.png" alt="Project Prism Logo" width="180" />
  <br/><br/>
  <img src="docs/assets/canvas-demo.gif" alt="Project Prism Interactive Canvas Demo" width="100%" />
  <p><i>Figure 1: Interactive Neo-Brutalist Canvas with Unreal Engine Blueprint-inspired node routing.</i></p>
</div>

---

## What is Project Prism?

**Project Prism** is an open-source Auto-ML engine designed to accelerate data preparation, cleaning, feature engineering, visualization, and model training. Built for both junior ML engineers and seasoned data scientists, Prism provides a **Two-Way Hybrid Architecture**:

1. **Prompt-Driven Mode:** Provide a natural language prompt alongside a raw dataset. Prism autonomously constructs the optimal processing DAG (Directed Acyclic Graph) and executes the pipeline.
2. **Manual Visual Canvas Mode:** Take full granular control. Drag, drop, and connect execution nodes (Fix, Clean, Feature Engineer, Plot, Train) on an interactive 2D canvas inspired by Unreal Engine Blueprints. Adjust node configurations with real-time dynamic column dropdowns.

---

## System Architecture & Workflow Diagrams

Prism decouples high-speed web orchestration, heavy asynchronous compute tasks, and hybrid metadata/object storage.

### 1. Overall System Architecture

```mermaid
flowchart LR
    A[Upload CSV Data] --> B[FastAPI Gateway / Redis + Celery]
    B --> C[Core ML Engine]
    C --> D[Dual Storage: Postgres + MinIO]
    D --> E[Result Rendered on Next.js Frontend]
```

### 2. Core ML Processing Pipeline

```mermaid
flowchart TD
    A[Fix Data] --> B[Clean Data]
    B --> C[Feature Engineer]
    B --> D[Generate Plots]
    C --> E[Train Model FLAML]
    E --> F[Export Deployment Pack]
    E --> G[Test Deployed Model Live]
```

---

## Core Pipeline Nodes & Functionalities

| Node Name | Key Functionality & Special Capabilities |
| :--- | :--- |
| **Fix Node** | Repairs structurally broken CSVs. Fixes corrupted headers, enforces uniform column counts, and replaces non-standard delimiters (e.g., `\|`, `;`, `\t`) with standard commas (`,`). Supported by LLM fallback diagnosis. |
| **Clean Node** | Powered by **Polars** for multi-threaded speed. Handles custom column dropping, deduplication, mean/median/mode/custom imputation, and **Smart Type Coercion** (e.g., stripping `$` signs from `$2000` to convert object types to true numeric floats). |
| **Plot Node** | Renders 5 interactive **Apache ECharts** (Histogram, Scatter, Bar, Heatmap, Box Plot). Automatically routed *before* feature scaling to preserve human-readable chart scales. Downloadable directly from UI. |
| **Feature Engineer** | Automatically or manually identifies categorical features for One-Hot Encoding and applies Standard or Min-Max scaling to numeric matrices. |
| **Train Node** | Utilizes **FLAML** (Fast & Lightweight AutoML) to find optimal algorithms given a time budget and metric (R², MAE, RMSE, Accuracy, F1). Supports cross-validation or custom train/test CSV splits. |

---

## Live Results, Inference Blueprints & Deployment Pack

Clicking **Run Pipeline** triggers a custom loading interface followed by an interactive, non-blocking **Result Modal**.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          PRISM RESULT DASHBOARD                         │
├─────────────────────────────────────────────────────────────────────────┤
│  [Download Fixed CSV]  [Download Clean CSV]  [Download FE CSV]          │
│                                                                         │
│  DEPLOYMENT PACK (.zip)                                                 │
│     ├── model.pkl                 (Trained FLAML Model Artifact)        │
│     └── inference_blueprint.json  (Pipeline Transformation Schema)      │
│                                                                         │
│  LIVE MODEL TESTING ENDPOINT                                            │
│     • Dynamically generated input form (JSON or GUI Form)               │
│     • Auto-maps raw user inputs to match exact trained model blueprint  │
│     • Instant real-time prediction output sidebar                       │
└─────────────────────────────────────────────────────────────────────────┘
```
<img src="docs/assets/result-modal.png" alt="Project Prism Logo" width="100%" />


> **Why the Inference Blueprint?**
> Feature engineering and cleaning steps alter dataset structure (e.g., scaling ranges, one-hot columns). The generated `inference_blueprint.json` records every single preprocessing step so developers can deploy the `.pkl` model into production without feature mismatch errors.

---

## Data Storage Architecture

Prism separates lightweight queryable metadata from heavy binary/file artifacts to ensure high performance and low storage latency.

| Storage Engine | Artifact Type Stored | Purpose & Lifecycle |
| :--- | :--- | :--- |
| **PostgreSQL** | • User Credentials & JWT Claims<br/>• Dataset Column Names & Metadata<br/>• Pipeline Run Logs & Evaluation Scores | High-speed indexing for the **History Dashboard**. Allows instant rendering of past runs without heavy asset pulling. |
| **MinIO (S3 API)** | • Raw Uploaded CSVs<br/>• Repaired & Cleaned CSVs<br/>• Feature Engineered Matrices<br/>• Exported `.pkl` Models & Blueprints | Secure, scalable object storage. Files are dynamically streamed on demand when opening past dashboards from History. |

---

## History Dashboard

The History page provides an organized overview of previous executions:
* **Lightweight Summary Cards:** Fetches model name, dataset name, and performance scores from PostgreSQL.
* **Dynamic Re-hydration:** Clicking **Open Dashboard** fetches the underlying CSVs, interactive ECharts, and Deployment Packs directly from MinIO without needing to re-run the pipeline.
* **One-Click Live Test:** Re-deploy past model artifacts for live testing at any time.

---

## Tech Stack

### Frontend
* **Framework:** Next.js 16 (App Router, Client Components)
* **Canvas Engine:** React Flow (`@xyflow/react`)
* **Styling:** Tailwind CSS (Neo-Brutalist Theme)
* **Authentication:** [Clerk](https://clerk.com) ([@clerk/nextjs](https://www.npmjs.com/package/@clerk/nextjs)) & PyJWT
* **Charts & Icons:** Apache ECharts (`echarts-for-react`) & Lucide React

### Backend & Core ML
* **Web Gateway:** FastAPI (Asynchronous Python)
* **Task Queue & Broker:** Celery + Redis
* **Database & ORM:** PostgreSQL + SQLAlchemy
* **Object Storage:** MinIO + `s3fs`
* **Data & Machine Learning:** Polars, NumPy, Pandas, Scikit-Learn, FLAML, Groq LLM API, Chardet, Joblib

---

## Quickstart & Local Installation

Prism is fully containerized with Docker Compose.

### 1. Clone the Repository
```bash
git clone [https://github.com/BhavyaDoriya/Project-Prism.git](https://github.com/BhavyaDoriya/Project-Prism.git)
cd Project-Prism
```

### 2. Environment Configuration
Create a `.env` file in the backend directory:
```env
DATABASE_URL=postgresql://prismadmin:prismpassword@postgres_db:5432/prismdb
MINIO_ENDPOINT_URL=minio:9000
REDIS_URL=redis://redis:6379/0
```
Create a `.env` file in the core_ml directory:
```env
GROQ_API_KEY=YOUR_GROQ_API_KEY
DATABASE_URL=postgresql://prismadmin:prismpassword@postgres_db:5432/prismdb
MINIO_ENDPOINT_URL=minio:9000
REDIS_URL=redis://redis:6379/0
```
Create a `.env.local` file in the frontend directory:
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=REPLACE_YOUR_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY=REPLACE_YOUR_CLEARK_SECRET_KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
CLERK_JWKS_URL=REPLACE_YOUR_CLERK_JWKS_URL
NEXT_PUBLIC_WEB3FORMS_KEY=REPLACE_YOUR_PUBLIC_WEB3FORMS (only used for about page email send facility.)
```

### 3. Launch via Docker
**Make sure you have docker desktop running in the background**
---
Run following command from root folder:
```bash
docker-compose up --build
```

Access the services in your browser:
* **Frontend App:** `http://localhost:3000`
* **FastAPI Swagger Docs:** `http://localhost:8000/docs`
* **MinIO Web Console:** `http://localhost:9001`

---
## Meet the Developers

Project Prism was developed collaboratively by:

* **[Bhavya Doriya](https://github.com/BhavyaDoriya)** — *Core ML & Infrastructure Architect*
  Architected the complete `core_ml` engine (including the LLM-assisted Fixer, Polars-driven Cleaner, ECharts Plotter, and FLAML Trainer) and designed the complete Docker containerization infrastructure.

* **[Shubhra jyoti](https://github.com/Shubhra-jyoti)** — *Full-Stack & Database Engineer*
  Engineered the FastAPI backend, orchestrated the PostgreSQL and MinIO database layers, and built the Next.js frontend interfaces, including the interactive React Flow canvas and History dashboards.

* **[Bhavya Shah](https://github.com/Bhavya-shah22)** — *Security & Environment Integration*
  Developed the Clerk authentication onboarding flow, managed environment variable configurations, and provided foundational operational support across the application.

## License
This project is licensed under the [MIT License](LICENSE).