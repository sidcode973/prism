# Contributing to Project Prism

Thank you for considering contributing to Project Prism. Whether you are fixing a bug, adding a new Machine Learning node, or improving the documentation, your help is welcome.

---

## Local Development Setup

There are two ways to run Project Prism locally. 

If you just want to test the software or make minor UI tweaks, use **Method A**. If you are actively developing the FastAPI backend or Celery ML workers and need instant live-reloading, use **Method B**.

### 1. Fork & Clone
Fork the repository to your own GitHub account, then clone your fork to your local machine:
```bash
git clone [https://github.com/YOUR-USERNAME/Project-Prism.git](https://github.com/YOUR-USERNAME/Project-Prism.git)
cd Project-Prism

# Link to the original repository to fetch updates later
git remote add upstream [https://github.com/BhavyaDoriya/Project-Prism.git](https://github.com/BhavyaDoriya/Project-Prism.git)
```

---

### Method A: Full Docker (Testing & Standard Run)
This is the easiest method. It spins up the entire stack (Frontend, Backend, Celery, and all Databases) inside Docker containers.

1. You will need to set up your local environment variables in three specific locations. Copy the .env structure from `README.md`.
2. Run the build command from the root directory:
```bash
docker-compose up --build
```
3. Access the app at `http://localhost:3000`.

---

### Method B: Hybrid Native Development (Active Coding)
This method runs the databases inside Docker, but runs the web servers natively in your own terminals. This provides instant live-reloading when you save Python or TypeScript files.

#### Step 1: Start the Databases Only
Run this command from the root directory to start only the infrastructure containers defined in your `docker-compose.yml`:
```bash
docker-compose up -d postgres_db minio redis
```

#### Step 2: Adjust Native Environment Variables
Because you are running the backend natively outside of Docker, your code cannot resolve internal Docker network names. You must change the connection hostnames in your `backend/.env` and `core_ml/.env` files to `localhost`:

* Change `postgres_db` to `localhost` (e.g., `postgresql://user:pass@localhost:5432/prismdb`)
* Change `minio` to `localhost`
* Change `redis` to `localhost`

#### Step 3: Run the Services (Separate Terminals)
Open three separate terminal windows to run the stack manually.

**Terminal 1: Frontend (Next.js)**
```bash
cd frontend
npm install
npm run dev
```

**Terminal 2: Background Worker (Celery)**
```bash
cd backend
python -m venv venv
source venv/Scripts/activate  # Or 'source venv/bin/activate' on Mac/Linux
pip install -r requirements.txt
celery -A celery_worker.celery_app worker --loglevel=info
```

**Terminal 3: API Gateway (FastAPI)**
```bash
cd backend
source venv/Scripts/activate  # Or 'source venv/bin/activate' on Mac/Linux
fastapi dev main.py
```

---

## Branching & Commit Guidelines

To keep the repository clean and readable, please follow these conventions:

### Branch Naming
Create a new branch for your work. Use a descriptive prefix:
* `feat/` for new features (e.g., `feat/add-xgboost-node`)
* `fix/` for bug fixes (e.g., `fix/canvas-render-bug`)
* `docs/` for documentation updates (e.g., `docs/update-architecture`)

### Commit Messages
We follow the Conventional Commits standard:
* `feat: added PCA dimensionality reduction node`
* `fix: resolved Polars type coercion crash on empty columns`
* `chore: updated npm dependencies`

---

## Adding a New ML Node

Project Prism is designed to be modular. If you want to add a new processing node (e.g., an NLP Tokenizer or a new Chart type), you will generally need to touch three areas:

1. **Frontend (`frontend/src/app/canvas/components/`):** Add the visual UI configuration for the node in the Sidebar and update the React Flow node types.
2. **Backend Gateway (`backend/main.py`):** Ensure the Pydantic schemas accept your new node's parameters.
3. **Core ML Engine (`core_ml/prism_ml/`):** Write the actual Python execution logic (using Polars, Scikit-Learn, etc.) and register it in `orchestrator.py`.

---

## Pull Request Process

1. Ensure your code follows the existing style (e.g., Neo-Brutalist Tailwind classes for UI, PEP 8 for Python).
2. Update the `README.md` or `ARCHITECTURE.md` if your changes alter the system topology or add major features.
3. Open a Pull Request against the `main` branch of the upstream `BhavyaDoriya/Project-Prism` repository.
4. Provide a clear summary of what you changed, why you changed it, and attach screenshots if you altered the UI.
5. A maintainer will review your code and merge it.