# YT Multi-Channel (MVP)

- Backend: FastAPI (`backend/`)
- Frontend: Static HTML/CSS/JS (`frontend/`)

## Dev (Windows)
```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn app.main:app --reload --port 8000 --app-dir backend



