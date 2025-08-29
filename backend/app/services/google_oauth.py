# backend/app/services/google_oauth.py
from authlib.integrations.starlette_client import OAuth

# Expose a module-level OAuth instance so `from ... import oauth` works
oauth = OAuth()

def _get(conf, lower: str, upper: str, default=None):
    """Read settings.lowercase first, then UPPERCASE, then default."""
    return getattr(conf, lower, None) or getattr(conf, upper, default)

def init_oauth(app, settings) -> None:
    """
    Register the Google OAuth client on startup.
    Works whether settings/.env use lowercase or UPPERCASE names.
    """

    client_id = _get(settings, "google_client_id", "GOOGLE_CLIENT_ID")
    client_secret = _get(settings, "google_client_secret", "GOOGLE_CLIENT_SECRET")
    redirect_uri = _get(
        settings,
        "redirect_uri", "OAUTH_REDIRECT_URL",
        "http://localhost:8000/auth/google/callback",
    )
    app_base_url = _get(
        settings,
        "app_base_url", "APP_BASE_URL",
        "http://localhost:8000",
    )

    if not client_id or not client_secret:
        raise RuntimeError(
            "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env"
        )

    # Save for routes that read from app.state
    app.state.oauth_redirect = redirect_uri
    app.state.app_base_url = app_base_url

    # (Re)register the provider on the shared module-level `oauth`
    # If uvicorn reloads, `register` will overwrite the prior config safely.
    oauth.register(
        name="google",
        client_id=client_id,
        client_secret=client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={
            # Include OIDC + YouTube scopes so we get email/profile and YT access
            "scope": (
                "openid email profile "
                "https://www.googleapis.com/auth/youtube.readonly "
                "https://www.googleapis.com/auth/yt-analytics.readonly "
                "https://www.googleapis.com/auth/yt-analytics-monetary.readonly"
            ),
            # Ensure refresh_token on first consent & allow re-consent
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
        },
    )
