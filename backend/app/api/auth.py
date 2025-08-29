# app/api/auth.py
from __future__ import annotations

import datetime as dt
import httpx
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlmodel import Session, select

from app.api.deps import require_user_id
from ..db.core import get_session
from ..db.models import User, GoogleAccount, Channel
from ..services.google_oauth import oauth
from app.core.crypto import encrypt_str, decrypt_str  # Fernet helpers you kept

router = APIRouter()


@router.get("/google/init")
async def google_init(request: Request):
    return await oauth.google.authorize_redirect(
        request,
        request.app.state.oauth_redirect,
        access_type="offline",          # ensures refresh_token on first consent
        prompt="consent",               # show consent screen
        include_granted_scopes="true",
    )


@router.get("/google/callback")
async def google_callback(request: Request, session: Session = Depends(get_session)):
    # If Google sent an error back (user canceled, etc.)
    if (err := request.query_params.get("error")):
        return RedirectResponse(url=f"/?oauth_error={err}", status_code=307)

    # Exchange code for tokens
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        return JSONResponse(
            {"detail": f"oauth error during token exchange: {e}"},
            status_code=400,
        )

    # Prefer token['userinfo'], then parse ID token, else call userinfo endpoint
    userinfo = token.get("userinfo")
    if not userinfo:
        try:
            userinfo = await oauth.google.parse_id_token(request, token)
        except Exception:
            userinfo = None
    if not userinfo:
        resp = await oauth.google.get(
            "https://openidconnect.googleapis.com/v1/userinfo", token=token
        )
        try:
            userinfo = resp.json()
        except Exception:
            userinfo = None

    email = (userinfo or {}).get("email", "")
    sub = (userinfo or {}).get("sub")
    if not email:
        return JSONResponse({"detail": "no email in userinfo/id_token"}, status_code=400)
    email = email.lower()

    # Upsert user
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        user = User(email=email)
        session.add(user)
        session.commit()
        session.refresh(user)

    # Keep session
    request.session["user_id"] = user.id

    # Tokens from Google
    refresh_token = token.get("refresh_token")  # often present only on first consent
    access_token = token.get("access_token")
    id_token = token.get("id_token")

    # Normalize scopes (list or space-separated string)
    scopes_val = token.get("scope") or []
    if isinstance(scopes_val, str):
        scopes_list = [s for s in scopes_val.split() if s]
    elif isinstance(scopes_val, (list, tuple)):
        scopes_list = list(scopes_val)
    else:
        scopes_list = []
    scopes_json = json.dumps(scopes_list)

    # Upsert GoogleAccount (one per (user_id, sub) when sub present)
    ga = None
    if sub:
        ga = session.exec(
            select(GoogleAccount).where(
                GoogleAccount.user_id == user.id, GoogleAccount.sub == sub
            )
        ).first()
    if not ga:
        ga = session.exec(select(GoogleAccount).where(GoogleAccount.user_id == user.id)).first()

    if ga:
        # Update existing row
        ga.email = email
        if sub:
            ga.sub = sub
        if refresh_token:
            ga.refresh_token_enc = encrypt_str(refresh_token)
        if access_token:
            ga.access_token_enc = encrypt_str(access_token)
        if id_token and hasattr(ga, "id_token"):
            ga.id_token = id_token
        ga.scopes_json = scopes_json or ga.scopes_json
        ga.status = "ok"
        ga.token_updated_at = dt.datetime.utcnow()
        session.add(ga)
    else:
        # Create new row (require a refresh_token on first link)
        if not refresh_token:
            return JSONResponse(
                {"detail": "No refresh token from Google; re-consent required"},
                status_code=400,
            )
        ga = GoogleAccount(
            user_id=user.id,
            email=email,
            sub=sub,
            refresh_token_enc=encrypt_str(refresh_token),
            access_token_enc=encrypt_str(access_token) if access_token else None,
            scopes_json=scopes_json,
            status="ok",
            token_updated_at=dt.datetime.utcnow(),
        )
        session.add(ga)

    session.commit()
    session.refresh(ga)

    # --- Discover channels for this Google account and upsert Channel rows ---
    # Use the fresh access_token if we have it; otherwise decrypt from DB cache.
    header_access_token = (
        access_token
        or (decrypt_str(ga.access_token_enc) if getattr(ga, "access_token_enc", None) else None)
    )
    if header_access_token:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(
                    "https://www.googleapis.com/youtube/v3/channels",
                    params={"part": "snippet,contentDetails,statistics", "mine": "true"},
                    headers={"Authorization": f"Bearer {header_access_token}"},
                )
            resp.raise_for_status()
            data = resp.json()
            for item in data.get("items", []):
                ch_id = item["id"]
                title = item["snippet"]["title"]
                thumb = (
                    item["snippet"]["thumbnails"]["default"]["url"]
                    if item["snippet"].get("thumbnails")
                    else None
                )

                row = session.exec(
                    select(Channel).where(Channel.yt_channel_id == ch_id)
                ).first()
                if row:
                    # Update ownership & display data
                    row.title = title
                    row.thumbnail_url = thumb or row.thumbnail_url
                    row.user_id = user.id
                    row.google_account_id = ga.id
                else:
                    session.add(
                        Channel(
                            user_id=user.id,
                            google_account_id=ga.id,
                            yt_channel_id=ch_id,
                            title=title,
                            thumbnail_url=thumb,
                            first_seen_at=dt.datetime.utcnow(),
                        )
                    )
            session.commit()
        except Exception:
            # Don't block login if discovery fails
            pass

    return RedirectResponse(url="/auth/connected", status_code=307)


@router.get("/connected")
def connected(user_id: int = Depends(require_user_id)):
    return {"ok": True, "user_id": user_id}


# Optional debug (does not reveal token strings)
@router.get("/me/google")
def me_google(
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    ga = session.exec(select(GoogleAccount).where(GoogleAccount.user_id == user_id)).first()
    if not ga:
        return {
            "ok": False,
            "reason": "no googleaccount row for user",
            "user_id": user_id,
        }
    return {
        "ok": True,
        "user_id": user_id,
        "google_account_id": getattr(ga, "id", None),
        "has_access_token": bool(ga.access_token_enc),
        "has_refresh_token": bool(ga.refresh_token),  # model property decrypts safely
        "status": ga.status,
    }
