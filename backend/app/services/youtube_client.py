# backend/app/services/youtube_client.py
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from sqlmodel import Session  # typing clarity

from app.core.crypto import decrypt_str, encrypt_str
from app.core.settings import settings

from ..db.models import OAuthCredential

# Scopes should match your OAuth consent
_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
]

# Refresh a little early to avoid handing out near-expiry tokens
_EXPIRY_SKEW = timedelta(seconds=90)

def _decrypt_access_token(cred: OAuthCredential) -> str | None:
    enc = getattr(cred, "access_token_encrypted", None)
    if not enc:
        return None
    try:
        return decrypt_str(enc)
    except Exception:
        return None

def _decrypt_refresh_token(cred: OAuthCredential) -> str | None:
    enc = getattr(cred, "refresh_token_encrypted", None)
    if not enc:
        return None
    try:
        return decrypt_str(enc)
    except Exception:
        return None

def _utcnow() -> datetime:
    return datetime.now(UTC)

def _as_tzaware_utc(dt_val: datetime | None) -> datetime | None:
    """Make a datetime UTC-aware; interpret naive as UTC."""
    if not dt_val:
        return None
    if dt_val.tzinfo is None:
        return dt_val.replace(tzinfo=UTC)
    return dt_val.astimezone(UTC)

def _to_db_naive_utc(dt_val: datetime | None) -> datetime | None:
    """Store as naive UTC for SQLite TIMESTAMP compatibility."""
    if not dt_val:
        return None
    aware = _as_tzaware_utc(dt_val)
    return aware.replace(tzinfo=None)

def _should_refresh(creds: Credentials) -> bool:
    # If no token, clearly refresh
    if not creds or not creds.token:
        return True
    # If expiry missing, be safe and refresh
    if not getattr(creds, "expiry", None):
        return True
    return creds.expiry <= (_utcnow() + _EXPIRY_SKEW)

def _build_youtube_service(session: Session, cred: OAuthCredential):
    """
    Build a YouTube Data API v3 client from stored tokens (new schema).
    Refreshes access_token if needed and persists the new token (+expiry) to DB.
    """
    if not cred:
        raise RuntimeError("OAuthCredential is required")

    access_token = _decrypt_access_token(cred)  # may be None on first run
    refresh_token = _decrypt_refresh_token(cred)
    if not refresh_token:
        raise RuntimeError("No refresh token stored; user must re-consent.")

    client_id = getattr(settings, "google_client_id", None) or getattr(settings, "GOOGLE_CLIENT_ID", None)
    client_secret = getattr(settings, "google_client_secret", None) or getattr(settings, "GOOGLE_CLIENT_SECRET", None)

    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=_SCOPES,
    )

    # Seed expiry from DB so google-auth knows when to refresh
    db_expiry = _as_tzaware_utc(getattr(cred, "expires_at", None))
    if db_expiry is not None:
        creds.expiry = db_expiry

    # Refresh if missing/expired/near-expiry
    if _should_refresh(creds):
        creds.refresh(Request())

        # Persist new access token and expiry (UTC-naive to match schema)
        if creds.token:
            cred.access_token_encrypted = encrypt_str(creds.token)
        if getattr(creds, "expiry", None):
            cred.expires_at = _to_db_naive_utc(creds.expiry)

        session.add(cred)
        session.commit()

    # Build the YouTube Data API client
    service = build("youtube", "v3", credentials=creds, cache_discovery=False)
    return service

def yt_channels_me(session: Session, cred: OAuthCredential) -> dict[str, Any]:
    """Return metadata for channels owned by the credentialed Google account."""
    service = _build_youtube_service(session, cred)
    items: list[dict[str, Any]] = []
    page_token: str | None = None
    first: dict[str, Any] | None = None

    while True:
        resp = service.channels().list(
            part="snippet,statistics,brandingSettings,status",
            mine=True,
            maxResults=50,
            pageToken=page_token,
        ).execute()

        if first is None:
            first = resp
        items.extend(resp.get("items", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    if first is None:
        return {"items": []}

    result = {k: v for k, v in first.items() if k not in {"items", "nextPageToken"}}
    result["items"] = items
    return result
