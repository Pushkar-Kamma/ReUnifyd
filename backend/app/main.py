# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
#from sqlmodel import text
from sqlalchemy import text
from fastapi.staticfiles import StaticFiles

from .db.core import engine
from .core.settings import settings
from .api.test_db import router as test_db_router
from .api.youtube import router as youtube_router
from .api.auth import router as auth_router

from .services.google_oauth import init_oauth
import os

app = FastAPI(title="YT Multi-Channel API", version="0.1.0")

# --- CORS ---
origins_csv = (
    getattr(settings, "cors_allow_origins", None)
    or getattr(settings, "CORS_ALLOW_ORIGINS", None)
    or "*"
)
origins = [o.strip() for o in origins_csv.split(",")] if origins_csv else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,   # required to send cookies from the browser
    allow_methods=["*"],
    allow_headers=["*"],
)
# NOTE: Browsers block Set-Cookie when allow_credentials=True and allow_origins=["*"].
# In prod, set explicit origins (e.g., FRONTEND_URL) instead of "*".

# --- Sessions (needed for OAuth state/nonce) ---
# HttpOnly is always set by SessionMiddleware.
# We'll set Secure based on environment and SameSite to 'lax' (works with OAuth redirects).
# Use a dedicated SESSION_SECRET (not your JWT secret). Fallbacks kept for compatibility.
session_secret = (
    getattr(settings, "session_secret", None)
    or os.environ.get("SESSION_SECRET")
    or getattr(settings, "jwt_secret", getattr(settings, "JWT_SECRET", "change_me"))
)

# Decide when to set the cookie 'Secure' flag:
# - True for production/HTTPS
# - False for local dev (http://localhost)
app_base_url = getattr(
    settings, "app_base_url",
    getattr(settings, "APP_BASE_URL", "http://localhost:8000"),
)
is_https = str(app_base_url).lower().startswith("https://")
env_name = (
    getattr(settings, "environment", None)
    or getattr(settings, "ENVIRONMENT", None)
    or os.environ.get("APP_ENV")
    or os.environ.get("ENV")
    or "development"
).lower()
secure_cookie = is_https or env_name in {"prod", "production"}

app.add_middleware(
    SessionMiddleware,
    secret_key=session_secret,
    session_cookie=getattr(settings, "session_cookie_name", "app_session"),
    same_site=getattr(settings, "session_same_site", "lax"),  # 'lax' recommended for OAuth
    https_only=secure_cookie,  # sets the 'Secure' flag
    max_age=getattr(settings, "session_max_age", 60 * 60 * 24 * 30),  # 30 days
    # domain=getattr(settings, "session_cookie_domain", None),  # set if you need a specific domain
    # path="/",
)

# --- Startup: ensure DB exists, then register OAuth client ---
@app.on_event("startup")
async def _startup() -> None:
    # 1) DB schema
    #create_db_and_tables()

    # 2) Make these available to routes (auth.py uses them)
    app.state.oauth_redirect = getattr(
        settings, "redirect_uri",
        getattr(settings, "OAUTH_REDIRECT_URL", "http://localhost:8000/auth/google/callback"),
    )
    app.state.app_base_url = app_base_url

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
        "cookie_secure": secure_cookie,
        "cookie_samesite": getattr(settings, "session_same_site", "lax"),
    }

# --- Serve UI files under /ui (safe) ---
# Avoid serving the entire backend directory (which can expose .env).
# Mount a *build* directory if provided and only in dev.
try:
    FRONTEND_BUILD = (
        getattr(settings, "frontend_build_dir", None)
        or os.environ.get("FRONTEND_BUILD_DIR")
        or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
    )
    if env_name in {"dev", "development"} and FRONTEND_BUILD and os.path.isdir(FRONTEND_BUILD):
        app.mount("/ui", StaticFiles(directory=FRONTEND_BUILD, html=True), name="ui")
except Exception:
    pass
