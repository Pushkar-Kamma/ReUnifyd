# app/services/token_helper.py
from __future__ import annotations

import datetime as dt

import httpx
from fastapi import Request
from sqlmodel import Session, select

from app.core.crypto import decrypt_str, encrypt_str
from app.core.settings import settings

from ..db.models import (
    Channel,
    OAuthCredential,
    Platform,
    PlatformAccount,
)

# Small expiry skew so we don't hand out almost-expired tokens
_SKEW = dt.timedelta(seconds=90)


# ----------------------------
# Internal helpers (new schema)
# ----------------------------

def _youtube_platform(session: Session) -> Platform | None:
    return session.exec(select(Platform).where(Platform.name == "youtube")).first()

def _oauth_cred_by_platform_account_id(session: Session, platform_account_id: int) -> OAuthCredential | None:
    return session.exec(
        select(OAuthCredential).where(OAuthCredential.platform_account_id == platform_account_id)
    ).first()

def _oauth_cred_for_user(session: Session, user_id: int) -> tuple[PlatformAccount | None, OAuthCredential | None]:
    yt = _youtube_platform(session)
    if not yt:
        return None, None
    pa = session.exec(
        select(PlatformAccount).where(
            PlatformAccount.platform_id == yt.id,
            PlatformAccount.owner_user_id == user_id,
        )
    ).first()
    if not pa:
        return None, None
    cred = _oauth_cred_by_platform_account_id(session, pa.id)
    return pa, cred

def _oauth_cred_for_channel(session: Session, channel_id: int) -> tuple[Channel | None, OAuthCredential | None]:
    ch = session.get(Channel, channel_id)
    if not ch or not ch.platform_account_id:
        return ch, None
    cred = _oauth_cred_by_platform_account_id(session, ch.platform_account_id)
    return ch, cred


def _get_cached_access_token(cred: OAuthCredential) -> str | None:
    """Return decrypted access token if present and not expiring soon."""
    enc = getattr(cred, "access_token_encrypted", None)
    if not enc:
        return None
    # If we have an expiry and it's too close, force refresh
    exp: dt.datetime | None = getattr(cred, "expires_at", None)
    if exp and (exp - _SKEW) <= dt.datetime.utcnow():
        return None
    try:
        return decrypt_str(enc)
    except Exception:
        return None

def _get_refresh_token(cred: OAuthCredential) -> str | None:
    enc = getattr(cred, "refresh_token_encrypted", None)
    if not enc:
        return None
    try:
        return decrypt_str(enc)
    except Exception:
        return None


async def _refresh_with_google(request: Request | None, refresh_token: str) -> dict:
    """
    POST a refresh to Google's token endpoint. Returns JSON like:
    {
      "access_token": "...",
      "expires_in": 3599,
      "token_type": "Bearer",
      "scope": "...",
      // sometimes: "refresh_token": "..."
    }
    """
    token_url = "https://oauth2.googleapis.com/token"
    if request is not None:
        token_url = getattr(request.app.state, "oauth_token_url", token_url)

    client_id = (
        getattr(settings, "google_client_id", None)
        or getattr(settings, "GOOGLE_CLIENT_ID", None)
    )
    client_secret = (
        getattr(settings, "google_client_secret", None)
        or getattr(settings, "GOOGLE_CLIENT_SECRET", None)
    )
    if not client_id or not client_secret:
        raise RuntimeError("OAuth client not configured")

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            token_url,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code >= 400:
        try:
            err = resp.json()
        except Exception:
            err = {"error": resp.text}
        raise RuntimeError(f"Failed to refresh access token: {err}")
    return resp.json()


def _persist_tokens_from_refresh(session: Session, cred: OAuthCredential, refreshed: dict) -> str:
    """
    Store new access token (+expiry) and rotated refresh token if present.
    Returns the plaintext access token.
    """
    access = refreshed.get("access_token")
    if not access:
        raise RuntimeError("Refresh response missing access_token")

    # expires_in is typical; some clients may also return absolute timestamps
    now = dt.datetime.utcnow()
    expires_in = refreshed.get("expires_in")
    if isinstance(expires_in, (int, float)):
        cred.expires_at = now + dt.timedelta(seconds=int(expires_in))
    elif "expires_at" in refreshed:
        # try to parse epoch seconds if provided
        try:
            cred.expires_at = dt.datetime.utcfromtimestamp(int(refreshed["expires_at"]))
        except Exception:
            cred.expires_at = None

    # rotate refresh token if Google sent a new one
    rotated_rt = refreshed.get("refresh_token")
    if rotated_rt:
        cred.refresh_token_encrypted = encrypt_str(rotated_rt)

    cred.access_token_encrypted = encrypt_str(access)
    session.add(cred)
    session.commit()
    return access


# ----------------------------
# Public API (same names/signatures)
# ----------------------------

async def get_valid_access_token(
    request: Request,
    session: Session,
    user_id: int,
) -> str:
    """
    Return a valid access token for the user's YouTube PlatformAccount.
    (New schema: PlatformAccount + OAuthCredential.)
    """
    pa, cred = _oauth_cred_for_user(session, user_id)
    if not cred:
        raise RuntimeError("No OAuth credential found for this user.")
    # use cached token if still valid
    tok = _get_cached_access_token(cred)
    if tok:
        return tok
    # refresh via Google
    rt = _get_refresh_token(cred)
    if not rt:
        raise RuntimeError("No refresh token stored; user must re-consent.")
    refreshed = await _refresh_with_google(request, rt)
    return _persist_tokens_from_refresh(session, cred, refreshed)


async def get_valid_access_token_for_channel(
    request: Request,
    session: Session,
    channel_id: int,
) -> str:
    """
    Return a valid access token for the PlatformAccount that owns the given Channel.
    Use this when a user can link multiple YouTube accounts.
    """
    ch, cred = _oauth_cred_for_channel(session, channel_id)
    if not ch:
        raise RuntimeError("Channel not found.")
    if not cred:
        raise RuntimeError("No OAuth credential linked to this channel's account.")
    tok = _get_cached_access_token(cred)
    if tok:
        return tok
    rt = _get_refresh_token(cred)
    if not rt:
        raise RuntimeError("No refresh token stored; user must re-consent.")
    refreshed = await _refresh_with_google(request, rt)
    return _persist_tokens_from_refresh(session, cred, refreshed)


async def refresh_and_persist_access_token(
    request: Request,
    session: Session,
    cred: OAuthCredential,
) -> str:
    """
    Compatibility function name retained.
    Explicitly refresh the given OAuthCredential and persist the new access token.
    """
    rt = _get_refresh_token(cred)
    if not rt:
        raise RuntimeError("No refresh token stored; user must re-consent.")
    refreshed = await _refresh_with_google(request, rt)
    return _persist_tokens_from_refresh(session, cred, refreshed)


# ----------------------------
# Request-less helpers (for background scheduler)
# ----------------------------

async def get_valid_access_token_for_channel_bg(
    session: Session,
    channel_id: int,
) -> str:
    """Same as get_valid_access_token_for_channel but does not require a Request."""
    ch, cred = _oauth_cred_for_channel(session, channel_id)
    if not ch:
        raise RuntimeError("Channel not found.")
    if not cred:
        raise RuntimeError("No OAuth credential linked to this channel's account.")
    tok = _get_cached_access_token(cred)
    if tok:
        return tok
    rt = _get_refresh_token(cred)
    if not rt:
        raise RuntimeError("No refresh token stored; user must re-consent.")
    refreshed = await _refresh_with_google(None, rt)
    return _persist_tokens_from_refresh(session, cred, refreshed)
