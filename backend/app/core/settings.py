# app/core/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional


class Settings(BaseSettings):
    # --- Core ---
    DATABASE_URL: Optional[str] = None
    REDIS_URL: Optional[str] = None

    # Use a stable secret in .env for sessions + JWTs (dev default is fine locally)
    JWT_SECRET: str = "dev-super-secret"

    # --- OAuth / Google ---
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None

    # Preferred env var name
    GOOGLE_REDIRECT_URI: Optional[str] = None
    # Back-compat with older name (will be used if GOOGLE_REDIRECT_URI missing)
    OAUTH_REDIRECT_URL: Optional[str] = None

    # Base URL of your app (used to derive redirect if none given)
    APP_BASE_URL: str = "http://localhost:8000"

    # --- CORS ---
    # Comma-separated list, e.g. "http://localhost:3000,https://myapp.com"
    CORS_ALLOW_ORIGINS: str = "*"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # ---- Helpers / normalization ----
    @property
    def cors_origins_list(self) -> List[str]:
        raw = (self.CORS_ALLOW_ORIGINS or "").strip()
        if not raw or raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def redirect_uri(self) -> str:
        """
        Final redirect URI used by the app.
        Order:
          1) GOOGLE_REDIRECT_URI
          2) OAUTH_REDIRECT_URL (legacy)
          3) APP_BASE_URL + /auth/google/callback
        """
        if self.GOOGLE_REDIRECT_URI:
            return self.GOOGLE_REDIRECT_URI
        if self.OAUTH_REDIRECT_URL:
            return self.OAUTH_REDIRECT_URL
        return f"{self.APP_BASE_URL.rstrip('/')}/auth/google/callback"


settings = Settings()
