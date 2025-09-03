# app/api/auth.py
from __future__ import annotations

import datetime as dt
import httpx
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlmodel import Session, select
from pydantic import BaseModel, EmailStr
import sqlalchemy as sa

from app.api.deps import require_user_id
from ..db.core import get_session
from ..db.models import User, GoogleAccount, Channel
from ..services.google_oauth import oauth
from app.core.crypto import encrypt_str, decrypt_str  # Fernet helpers you kept
from app.core.security import hash_password, verify_password

router = APIRouter()


@router.get("/google/init")
async def google_init(request: Request):
    # Optional: remember where to return after linking
    next_url = request.query_params.get("next") or "/ui/link.html"
    request.session["post_oauth_next"] = next_url
    # Optional: enforce quota before starting OAuth
    uid = request.session.get("user_id")
    if uid:
        from ..db.core import engine as _engine
        from sqlmodel import Session as _Sess
        from ..db.models import User, Channel as _Channel
        with _Sess(_engine) as s:
            u = s.get(User, uid)
            quota = getattr(u, "link_quota", None)
            if quota is not None:
                current = s.exec(
                    select(sa.func.count()).select_from(_Channel).where(
                        _Channel.user_id == uid, _Channel.active == True
                    )
                ).one()
                try:
                    current = int(current)
                except Exception:
                    current = 0
                if int(quota) - current <= 0:
                    return RedirectResponse(url="/ui/link.html?quota=exceeded", status_code=307)

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
        # Redirect back to UI with error so the user stays in flow
        return RedirectResponse(url=f"/ui/link.html?oauth_error={e}", status_code=307)

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
    email = (email or "").lower()

    # Determine which app user to link to: prefer existing logged-in user
    user_id = request.session.get("user_id")
    user = session.get(User, user_id) if user_id else None
    if not user:
        # Fallback: upsert by email if provided
        if not email:
            return JSONResponse({"detail": "no email in userinfo/id_token and no logged-in user"}, status_code=400)
        user = session.exec(select(User).where(User.email == email)).first()
        if not user:
            user = User(email=email)
            session.add(user)
            session.commit()
            session.refresh(user)
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
            # Quota enforcement: only add up to remaining slots if a quota is set
            current_count = session.exec(
                select(sa.func.count()).select_from(Channel).where(
                    Channel.user_id == user.id, Channel.active == True
                )
            ).one()
            try:
                current_count = int(current_count)
            except Exception:
                current_count = 0
            remaining = None
            if getattr(user, "link_quota", None) is not None:
                remaining = max(0, int(user.link_quota) - current_count)
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
                    if remaining is not None and remaining <= 0:
                        continue
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
                    if remaining is not None:
                        remaining -= 1
            session.commit()
        except Exception:
            # Don't block login if discovery fails
            pass

    next_url = request.session.pop("post_oauth_next", None) or "/ui/dashboard.html?linked=1"
    return RedirectResponse(url=next_url, status_code=307)


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


# ----------------------------
# Local auth: signup/login/logout
# ----------------------------

class SignupIn(BaseModel):
    email: EmailStr
    username: str
    password: str


class LoginIn(BaseModel):
    username_or_email: str
    password: str


@router.post("/signup")
def signup(body: SignupIn, req: Request, session: Session = Depends(get_session)):
    email = body.email.lower().strip()
    username = body.username.strip().lower()

    # Uniqueness checks
    if session.exec(select(User).where(User.email == email)).first():
        return JSONResponse({"detail": "email already registered"}, status_code=400)
    if session.exec(select(User).where(User.username == username)).first():
        return JSONResponse({"detail": "username already taken"}, status_code=400)

    u = User(email=email, username=username, password_hash=hash_password(body.password))
    session.add(u)
    session.commit()
    session.refresh(u)
    req.session["user_id"] = u.id
    return {"ok": True, "user_id": u.id, "username": u.username}


@router.post("/login")
def login(body: LoginIn, req: Request, session: Session = Depends(get_session)):
    ident = body.username_or_email.strip().lower()
    user = session.exec(
        select(User).where((User.username == ident) | (User.email == ident))
    ).first()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        return JSONResponse({"detail": "invalid credentials"}, status_code=401)
    # set session
    req.session["user_id"] = user.id
    # daily rollover for manual refresh counter
    try:
        from datetime import date as _date
        if getattr(user, "manual_refresh_date", None) != _date.today():
            user.manual_refresh_date = _date.today()
            user.manual_refresh_count = 0
            session.add(user)
            session.commit()
    except Exception:
        pass
    return {"ok": True, "user_id": user.id, "username": user.username}


@router.post("/logout")
def logout(req: Request):
    req.session.pop("user_id", None)
    return {"ok": True}


# ----------------------------
# Quota endpoints
# ----------------------------

class QuotaIn(BaseModel):
    count: int


@router.post("/quota")
def set_quota(
    body: QuotaIn,
    request: Request,
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    n = max(0, min(int(body.count), 20))
    user = session.get(User, user_id)
    if not user:
        return JSONResponse({"detail": "user not found"}, status_code=404)
    user.link_quota = n
    session.add(user)
    session.commit()
    return {"ok": True, "link_quota": n}


@router.get("/me")
def me(user_id: int = Depends(require_user_id), session: Session = Depends(get_session)):
    u = session.get(User, user_id)
    return {
        "ok": True,
        "user_id": user_id,
        "email": getattr(u, "email", None),
        "username": getattr(u, "username", None),
        "link_quota": getattr(u, "link_quota", None),
        "manual_refresh_date": str(getattr(u, "manual_refresh_date", None)) if u else None,
        "manual_refresh_count": getattr(u, "manual_refresh_count", 0) if u else 0,
    }
