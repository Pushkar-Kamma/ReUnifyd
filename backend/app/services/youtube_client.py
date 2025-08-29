# app/services/youtube_client.py
from typing import Dict, Any, Optional
from sqlmodel import Session  # for typing clarity
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from ..db.models import GoogleAccount
from app.core.crypto import encrypt_str, decrypt_str


# Scope list should match what you requested during OAuth
_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
]


def _decrypt_access_token(ga: GoogleAccount) -> Optional[str]:
    enc = getattr(ga, "access_token_enc", None)
    if not enc:
        return None
    try:
        return decrypt_str(enc)
    except Exception:
        return None


def _build_youtube_service(session: Session, ga: GoogleAccount):
    """
    Build a YouTube Data API v3 client from stored tokens.
    Refreshes access_token if expired (when refresh_token is available)
    and persists the new access_token back to DB (encrypted).
    """
    if not ga:
        raise RuntimeError("GoogleAccount is required")

    # Decrypted tokens from encrypted storage
    access_token = _decrypt_access_token(ga)  # may be None on first run
    refresh_token = ga.refresh_token          # model property -> decrypted or None

    if not refresh_token:
        raise RuntimeError("No refresh token stored; user must re-consent.")

    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        # For public clients, client_id/secret are not required for refresh_token grant
        client_id=None,
        client_secret=None,
        scopes=_SCOPES,
        id_token=getattr(ga, "id_token", None),
    )

    # If token is missing/expired and we have a refresh token, refresh it
    if creds and (creds.expired or not creds.token) and creds.refresh_token:
        creds.refresh(Request())
        # persist new access token (and possibly id_token) back to DB (encrypted)
        if creds.token:
            ga.access_token_enc = encrypt_str(creds.token)
        if hasattr(creds, "id_token") and getattr(creds, "id_token", None):
            ga.id_token = creds.id_token
        session.add(ga)
        session.commit()

    service = build("youtube", "v3", credentials=creds, cache_discovery=False)
    return service


def yt_channels_me(session: Session, ga: GoogleAccount) -> Dict[str, Any]:
    """
    Minimal example call: return the authorized channel’s basic info.
    """
    service = _build_youtube_service(session, ga)
    resp = service.channels().list(
        part="snippet,statistics,brandingSettings",
        mine=True,
        maxResults=1,
    ).execute()
    return resp
