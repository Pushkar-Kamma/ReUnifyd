# app/services/youtube_client.py
from typing import Dict, Any
from sqlmodel import Session  # just for typing clarity; not used directly here
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from ..db.models import GoogleAccount

# Scope list should match what you requested during OAuth
_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
]

def _build_youtube_service(session: Session, ga: GoogleAccount):
    """
    Build a YouTube Data API v3 client from stored tokens.
    Refreshes access_token if expired (when refresh_token is available)
    and persists the new access_token back to DB.
    """
    if not ga:
        raise RuntimeError("GoogleAccount is required")

    creds = Credentials(
        token=ga.access_token,
        refresh_token=ga.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=None,              # not needed when using refresh_token + token_uri
        client_secret=None,          # not needed when using refresh_token + token_uri
        scopes=_SCOPES,
        id_token=ga.id_token,
    )

    # If token is expired and we have a refresh token, refresh it
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        # persist new access token (and possibly id_token) back to DB
        ga.access_token = creds.token
        ga.id_token = getattr(creds, "id_token", ga.id_token)
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
