# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from sqlmodel import text

from .db.core import engine, create_db_and_tables
from .core.settings import settings
from .api.test_db import router as test_db_router
from .api.youtube import router as youtube_router
from .api.auth import router as auth_router

from .services.google_oauth import init_oauth


app = FastAPI(title="YT Multi-Channel API", version="0.1.0")

# --- CORS (dev: allow all) ---
origins_csv = (
    getattr(settings, "cors_allow_origins", None)
    or getattr(settings, "CORS_ALLOW_ORIGINS", None)
    or "*"
)
origins = [o.strip() for o in origins_csv.split(",")] if origins_csv else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Sessions (needed for OAuth state/nonce) ---
app.add_middleware(
    SessionMiddleware,
    secret_key=getattr(settings, "jwt_secret", getattr(settings, "JWT_SECRET", "change_me")),
    same_site="lax",
)

# --- Startup: ensure DB exists, then register OAuth client ---
@app.on_event("startup")
async def _startup() -> None:
    # 1) DB schema
    create_db_and_tables()

    # 2) Make these available to routes (auth.py uses them)
    app.state.oauth_redirect = getattr(
        settings, "redirect_uri",
        getattr(settings, "OAUTH_REDIRECT_URL", "http://localhost:8000/auth/google/callback"),
    )
    app.state.app_base_url = getattr(
        settings, "app_base_url",
        getattr(settings, "APP_BASE_URL", "http://localhost:8000"),
    )

    # 3) Register the Google OAuth client
    init_oauth(app, settings)


# --- Health & DB ---
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/db/ping")
def db_ping():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"db": "ok"}

# --- Routers ---
app.include_router(test_db_router)
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(youtube_router, prefix="/youtube", tags=["youtube"])

# --- Root to avoid 404 after OAuth redirect ---
@app.get("/")
def root():
    return {"message": "Backend is running. See /docs for API."}

# --- Debug ---
@app.get("/debug/oauth-config")
def debug_oauth_config():
    cid = getattr(settings, "google_client_id", getattr(settings, "GOOGLE_CLIENT_ID", "")) or ""
    has_secret = bool(getattr(settings, "google_client_secret", getattr(settings, "GOOGLE_CLIENT_SECRET", None)))
    redirect_url = getattr(settings, "redirect_uri", getattr(settings, "OAUTH_REDIRECT_URL", None))
    return {
        "client_id_prefix": cid[:8],
        "has_secret": has_secret,
        "redirect_url": redirect_url,
    }
