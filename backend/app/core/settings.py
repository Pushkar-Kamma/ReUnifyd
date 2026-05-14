# app/core/settings.py
import os

from pydantic_settings import BaseSettings, SettingsConfigDict


def _resolve_env_file() -> str | None:
    """Resolve an .env that works whether running from repo root or backend/.

    Tries, in order:
      1) backend/.env (when running from repo root)
      2) backend/app/.env (alternate copy in tree)
      3) .env (when cwd is backend/)
    """
    here = os.path.dirname(__file__)                 # backend/app/core
    backend_dir = os.path.abspath(os.path.join(here, "..", ".."))
    repo_root = os.path.abspath(os.path.join(backend_dir, ".."))
    candidates = [
        os.path.join(backend_dir, ".env"),
        os.path.join(backend_dir, "app", ".env"),
        os.path.join(repo_root, ".env"),
        os.path.abspath(os.path.join(os.getcwd(), ".env")),
    ]
    for p in candidates:
        try:
            if os.path.exists(p):
                return p
        except Exception:
            continue
    return None


class Settings(BaseSettings):
    # --- App ---
    ENVIRONMENT: str = "development"
    APP_BASE_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"

    # --- Core ---
    DATABASE_URL: str | None = None
    REDIS_URL: str | None = None

    # --- Secrets (dev fallbacks; required & validated in production) ---
    JWT_SECRET: str = "dev-super-secret"
    SESSION_SECRET: str | None = None    # falls back to JWT_SECRET if missing
    FERNET_KEY: str | None = None        # required for OAuth token encryption

    # --- Session cookie ---
    SESSION_SAME_SITE: str = "lax"           # 'none' for cross-site cookies in prod
    SESSION_COOKIE_NAME: str = "app_session"
    SESSION_MAX_AGE: int = 60 * 60 * 24 * 30  # 30 days

    # --- OAuth / Google ---
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REDIRECT_URI: str | None = None
    OAUTH_REDIRECT_URL: str | None = None  # legacy alias

    # --- CORS ---
    CORS_ALLOW_ORIGINS: str = "http://localhost:3000,http://localhost:8000"

    # --- Email ---
    RESEND_API_KEY: str | None = None
    EMAIL_FROM: str = "noreply@edstart.xyz"

    # --- Observability ---
    SENTRY_DSN: str | None = None

    model_config = SettingsConfigDict(
        env_file=_resolve_env_file(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- Helpers ----
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"prod", "production"}

    @property
    def cors_origins_list(self) -> list[str]:
        raw = (self.CORS_ALLOW_ORIGINS or "").strip()
        if not raw or raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def redirect_uri(self) -> str:
        if self.GOOGLE_REDIRECT_URI:
            return self.GOOGLE_REDIRECT_URI
        if self.OAUTH_REDIRECT_URL:
            return self.OAUTH_REDIRECT_URL
        return f"{self.APP_BASE_URL.rstrip('/')}/auth/google/callback"

    @property
    def session_secret(self) -> str:
        return self.SESSION_SECRET or self.JWT_SECRET

    def validate_required(self) -> None:
        """Fail fast on startup if critical config is missing or insecure."""
        missing: list[str] = []
        if not self.GOOGLE_CLIENT_ID:
            missing.append("GOOGLE_CLIENT_ID")
        if not self.GOOGLE_CLIENT_SECRET:
            missing.append("GOOGLE_CLIENT_SECRET")
        if not self.DATABASE_URL:
            missing.append("DATABASE_URL")
        if not self.FERNET_KEY:
            missing.append("FERNET_KEY")

        if self.is_production:
            insecure_defaults = {"dev-super-secret", "change_me_locally", "replace_me", ""}
            if not self.SESSION_SECRET or self.SESSION_SECRET in insecure_defaults:
                missing.append("SESSION_SECRET (insecure or missing)")
            if self.JWT_SECRET in insecure_defaults:
                missing.append("JWT_SECRET (insecure default)")
            if "*" in self.cors_origins_list:
                missing.append("CORS_ALLOW_ORIGINS (wildcard not allowed in production)")

        if missing:
            raise RuntimeError(
                "Missing/insecure required settings: "
                + ", ".join(missing)
                + ". See backend/.env.example."
            )


settings = Settings()
