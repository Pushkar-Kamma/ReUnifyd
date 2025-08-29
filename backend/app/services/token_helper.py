# app/services/token_helper.py
from __future__ import annotations

from fastapi import Request
from sqlmodel import Session, select

from ..db.models import GoogleAccount

def _get_refresh_token_from_ga(ga: GoogleAccount) -> str | None:
    # Support either field name
    rt = getattr(ga, "refresh_token", None)
    if not rt:
        rt = getattr(ga, "refresh_token_enc", None)
    return rt

def _set_access_token_on_ga(ga: GoogleAccount, access_token: str) -> None:
    if hasattr(ga, "access_token"):
        setattr(ga, "access_token", access_token)

async def get_valid_access_token(
    request: Request,
    session: Session,
    user_id: int,
) -> str:
    ga = session.exec(
        select(GoogleAccount).where(GoogleAccount.user_id == user_id)
    ).first()
    if not ga:
        raise RuntimeError("No Google account linked for this user.")

    rt = _get_refresh_token_from_ga(ga)
    if not rt:
        raise RuntimeError("No refresh token stored; user must re-consent.")

    token = getattr(ga, "access_token", None)
    if token:
        return token

    return await refresh_and_persist_access_token(request, session, ga)

async def refresh_and_persist_access_token(
    request: Request,
    session: Session,
    ga: GoogleAccount,
) -> str:
    oauth = request.app.state.oauth
    token_url = getattr(request.app.state, "oauth_token_url", "https://oauth2.googleapis.com/token")

    rt = _get_refresh_token_from_ga(ga)
    if not rt:
        raise RuntimeError("No refresh token stored; user must re-consent.")

    try:
        refreshed = await oauth.google.refresh_token(
            url=token_url,
            refresh_token=rt,
        )
    except Exception as e:
        ga.status = "revoked"
        session.add(ga)
        session.commit()
        raise RuntimeError(f"Failed to refresh access token: {e}")

    new_access = refreshed.get("access_token")
    if not new_access:
        raise RuntimeError("Refresh response missing access_token.")

    _set_access_token_on_ga(ga, new_access)
    ga.status = "ok"
    session.add(ga)
    session.commit()
    return new_access
