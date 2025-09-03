# app/services/token_helper.py
from __future__ import annotations

from fastapi import Request
import httpx
from sqlmodel import Session, select
from ..db.models import GoogleAccount, Channel
from app.core.crypto import encrypt_str, decrypt_str
from app.core.settings import settings


def _get_refresh_token_from_ga(ga: GoogleAccount) -> str | None:
    """Return usable refresh token (decrypt encrypted column)."""
    enc = getattr(ga, "refresh_token_enc", None)
    if not enc:
        return None
    try:
        return decrypt_str(enc)
    except Exception:
        return None


def _get_access_token_cached(ga: GoogleAccount) -> str | None:
    """Return current cached access token (decrypt encrypted column)."""
    enc = getattr(ga, "access_token_enc", None)
    if not enc:
        return None
    try:
        return decrypt_str(enc)
    except Exception:
        return None


def _set_access_token_on_ga(ga: GoogleAccount, access_token: str) -> None:
    """Persist access token encrypted."""
    ga.access_token_enc = encrypt_str(access_token)


def _maybe_set_rotated_refresh_token(ga: GoogleAccount, new_refresh_token: str | None) -> None:
    """
    Google may rotate/return a new refresh_token on some refreshes.
    If present, store it (encrypted). If not, keep the existing one.
    """
    if new_refresh_token:
        ga.refresh_token_enc = encrypt_str(new_refresh_token)


async def get_valid_access_token(
    request: Request,
    session: Session,
    user_id: int,
) -> str:
    """
    Return a valid access token for the *first* GoogleAccount linked to the user.
    Keeps legacy behavior of your original code.
    """
    ga = session.exec(
        select(GoogleAccount).where(GoogleAccount.user_id == user_id)
    ).first()
    if not ga:
        raise RuntimeError("No Google account linked for this user.")

    rt = _get_refresh_token_from_ga(ga)
    if not rt:
        raise RuntimeError("No refresh token stored; user must re-consent.")

    # return cached access token if present
    token = _get_access_token_cached(ga)
    if token:
        return token

    return await refresh_and_persist_access_token(request, session, ga)


async def get_valid_access_token_for_channel(
    request: Request,
    session: Session,
    channel_id: int,
) -> str:
    """
    Return a valid access token for the GoogleAccount that owns the given Channel.
    Use this when a user can link multiple Google accounts.
    """
    c = session.get(Channel, channel_id)
    if not c:
        raise RuntimeError("Channel not found.")
    ga = session.get(GoogleAccount, c.google_account_id)
    if not ga:
        raise RuntimeError("No Google account linked to this channel.")

    # Try cached access token
    token = _get_access_token_cached(ga)
    if token:
        return token

    return await refresh_and_persist_access_token(request, session, ga)


async def refresh_and_persist_access_token(
    request: Request,
    session: Session,
    ga: GoogleAccount,
) -> str:
    """
    Use the stored refresh token to obtain a new access token (and possibly a rotated refresh token).
    Persist tokens encrypted; update GA status/timestamps.
    """
    token_url = getattr(
        request.app.state, "oauth_token_url", "https://oauth2.googleapis.com/token"
    )

    rt = _get_refresh_token_from_ga(ga)
    if not rt:
        raise RuntimeError("No refresh token stored; user must re-consent.")

    # Perform a direct token refresh POST to Google's endpoint to avoid
    # integration-specific client methods that may be unavailable.
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

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                token_url,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": rt,
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
            ga.status = "revoked"
            session.add(ga)
            session.commit()
            raise RuntimeError(f"Failed to refresh access token: {err}")
        refreshed = resp.json()
    except Exception as e:
        ga.status = "revoked"
        session.add(ga)
        session.commit()
        raise RuntimeError(f"Failed to refresh access token: {e}")

    new_access = refreshed.get("access_token")
    if not new_access:
        raise RuntimeError("Refresh response missing access_token.")

    # Google may return a rotated refresh_token; store it if present
    rotated_rt = refreshed.get("refresh_token")
    _maybe_set_rotated_refresh_token(ga, rotated_rt)

    _set_access_token_on_ga(ga, new_access)
    ga.status = "ok"

    from datetime import datetime
    ga.token_updated_at = datetime.utcnow()

    session.add(ga)
    session.commit()
    return new_access
