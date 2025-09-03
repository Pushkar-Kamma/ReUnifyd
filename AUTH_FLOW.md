Local Auth + Multi‑Account Linking
=================================

Dev quick start
---------------

1. Create venv and install deps:

   - Windows PowerShell
     - `py -m venv .venv`
     - `.\.venv\Scripts\Activate.ps1`
     - `pip install -r backend\requirements.txt`
     - `uvicorn app.main:app --reload --port 8000 --app-dir backend`

2. Open the UI:

   - Sign up: http://localhost:8000/ui/signup.html
   - Log in: http://localhost:8000/ui/login.html
   - Link channels: http://localhost:8000/ui/link.html

3. Configure `.env` (in `backend/` or environment vars):

   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `APP_BASE_URL` (e.g., `http://localhost:8000`)
   - Optional: `GOOGLE_REDIRECT_URI` (defaults to `${APP_BASE_URL}/auth/google/callback`)

API Summary
-----------

- POST `/auth/signup` { email, username, password }
- POST `/auth/login` { username_or_email, password }
- POST `/auth/logout`
- GET `/auth/google/init?next=/ui/link.html`
- GET `/auth/google/callback`
- GET `/youtube/channels` – list linked channels for current user
- POST `/youtube/sync/daily` – sync daily metrics for a channel

Notes
-----

- Cookies carry the session; keep UI on same origin (the app serves UI under `/ui`).
- OAuth callback attaches Google accounts to the currently logged‑in user if present; otherwise it creates a new user using the Google email.
