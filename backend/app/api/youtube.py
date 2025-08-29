# backend/app/api/youtube.py
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from ..db.core import get_session
from ..db.models import GoogleAccount
from ..services.token_helper import (
    get_valid_access_token,
    refresh_and_persist_access_token,
)

router = APIRouter()


@router.get("/channels/me")
async def channels_me(request: Request, session: Session = Depends(get_session)):
    """
    Returns the authenticated user's channel info.

    Flow:
      1) Get/refresh a usable access token (using the refresh token if needed).
      2) Call YouTube channels.list?mine=true.
      3) If Google replies 401, refresh once and retry.
    """
    # --- 0) Require a signed-in session ---
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="not authenticated")

    # --- 1) Ensure the user has a linked GoogleAccount row ---
    ga = session.exec(
        select(GoogleAccount).where(GoogleAccount.user_id == user_id)
    ).first()
    if not ga:
        raise HTTPException(status_code=400, detail="no connected Google account")

    # --- 2) Obtain a valid access token (helper may refresh or bootstrap) ---
    try:
        access_token = await get_valid_access_token(request, session, user_id)
    except RuntimeError as e:
        # surface a useful message (e.g., "No refresh token stored; user must re-consent.")
        raise HTTPException(status_code=401, detail=str(e))

    # Helper to call YouTube once with a given token
    async def call_youtube(token: str) -> httpx.Response:
        async with httpx.AsyncClient(timeout=20.0) as client:
            return await client.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={
                    "part": "snippet,contentDetails,statistics",
                    "mine": "true",
                },
                headers={"Authorization": f"Bearer {token}"},
            )

    # --- 3) First attempt ---
    resp = await call_youtube(access_token)

    # --- 4) If token was stale and Google says 401, refresh once and retry ---
    if resp.status_code == 401:
        try:
            new_access = await refresh_and_persist_access_token(request, session, ga)
        except RuntimeError as e:
            raise HTTPException(status_code=401, detail=str(e))
        resp = await call_youtube(new_access)

    if resp.status_code == 401:
        # still unauthorized after refresh: likely revoked or wrong scopes
        raise HTTPException(
            status_code=401,
            detail="unauthorized from YouTube API (token likely revoked or missing scopes)",
        )

    # Raise any other non-2xx as HTTPException with upstream body
    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)

    data = resp.json()
    return {
        "ok": True,
        "user_id": user_id,
        "google_account_id": getattr(ga, "id", None),
        "channels": data,
    }


@router.get("/debug/googleaccount")
def debug_googleaccount(request: Request, session: Session = Depends(get_session)):
    """
    Simple debug endpoint to see what we have stored for the current user.
    (Does not reveal token strings.)
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="not authenticated")

    ga = session.exec(
        select(GoogleAccount).where(GoogleAccount.user_id == user_id)
    ).first()
    if not ga:
        raise HTTPException(status_code=404, detail="no google account row")

    return {
        "ok": True,
        "user_id": user_id,
        "google_account_id": getattr(ga, "id", None),
        "has_access_token": bool(getattr(ga, "access_token", None)),
        "has_refresh_token": bool(getattr(ga, "refresh_token", None)),
        "status": getattr(ga, "status", None),
        "created_at": str(getattr(ga, "created_at", None)),
    }
