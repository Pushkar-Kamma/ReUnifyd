# app/api/auth.py
from __future__ import annotations

import datetime as dt
import httpx
import json
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse, JSONResponse
from sqlmodel import Session, select
from pydantic import BaseModel, EmailStr
import sqlalchemy as sa

from app.api.deps import require_user_id
from ..db.core import get_session
from ..db.models import (
    User,
    Platform,
    PlatformAccount,
    OAuthCredential,
    Channel,
    UserChannel,
)
from ..services.google_oauth import oauth
from app.core.crypto import encrypt_str, decrypt_str  # Fernet helpers you kept
from app.core.security import hash_password, verify_password

router = APIRouter()

# ---------- helpers (schema-aware) ----------

def _ensure_youtube_platform(session: Session) -> Platform:
    plat = session.exec(select(Platform).where(Platform.name == "youtube")).first()
    if not plat:
        plat = Platform(name="youtube")
        session.add(plat)
        session.commit()
        session.refresh(plat)
    return plat

def _ensure_platform_account(session: Session, user: User, platform: Platform) -> PlatformAccount:
    pa = session.exec(
        select(PlatformAccount)
        .where(PlatformAccount.platform_id == platform.id, PlatformAccount.owner_user_id == user.id)
    ).first()
    if not pa:
        pa = PlatformAccount(platform_id=platform.id, owner_user_id=user.id, display_name=user.name or user.email)
        session.add(pa)
        session.commit()
        session.refresh(pa)
    return pa

def _upsert_oauth_credential(
    session: Session,
    platform_account_id: int,
    access_token: Optional[str],
    refresh_token: Optional[str],
    scopes_list: list[str],
    expires_at: Optional[dt.datetime],
) -> OAuthCredential:
    cred = session.exec(
        select(OAuthCredential).where(OAuthCredential.platform_account_id == platform_account_id)
    ).first()
    scopes_str = " ".join(scopes_list) if scopes_list else None
    if cred:
        if access_token:
            cred.access_token_encrypted = encrypt_str(access_token)
        if refresh_token:
            cred.refresh_token_encrypted = encrypt_str(refresh_token)
        cred.scopes = scopes_str or cred.scopes
        cred.expires_at = expires_at or cred.expires_at
        session.add(cred)
    else:
        if not refresh_token:
            # first time linking must give a refresh token (Google sends it on first consent)
            raise ValueError("No refresh token from Google; re-consent required")
        cred = OAuthCredential(
            platform_account_id=platform_account_id,
            access_token_encrypted=encrypt_str(access_token) if access_token else None,
            refresh_token_encrypted=encrypt_str(refresh_token),
            scopes=scopes_str,
            expires_at=expires_at,
        )
        session.add(cred)
    session.commit()
    session.refresh(cred)
    return cred

def _link_user_channel_owner(session: Session, user_id: int, channel_id: int) -> None:
    existing = session.exec(
        select(UserChannel).where(UserChannel.user_id == user_id, UserChannel.channel_id == channel_id)
    ).first()
    if not existing:
        session.add(UserChannel(user_id=user_id, channel_id=channel_id, role="owner"))
        session.commit()

# ---------- OAuth: init & callback ----------

@router.get("/google/init")
async def google_init(request: Request, session: Session = Depends(get_session)):
    # Remember where to return after linking
    next_url = request.query_params.get("next") or "/ui/link.html"
    request.session["post_oauth_next"] = next_url

    # (Optional) You previously enforced a user link quota here; new schema has no link_quota.
    # If you reintroduce quotas later, compute with a join on user_channel.

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
        return RedirectResponse(url=f"/ui/link.html?oauth_error={e}", status_code=307)

    # Parse userinfo
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

    email = ((userinfo or {}).get("email") or "").lower()
    sub = (userinfo or {}).get("sub")

    # Resolve current app user: prefer logged-in session, otherwise upsert by email
    user_id = request.session.get("user_id")
    user = session.get(User, user_id) if user_id else None
    if not user:
        if not email:
            return JSONResponse({"detail": "no email in userinfo/id_token and no logged-in user"}, status_code=400)
        user = session.exec(select(User).where(User.email == email)).first()
        if not user:
            user = User(email=email, name=(userinfo or {}).get("name"))
            session.add(user)
            session.commit()
            session.refresh(user)
        request.session["user_id"] = user.id

    # Tokens
    refresh_token = token.get("refresh_token")  # often only on first consent
    access_token = token.get("access_token")
    # Compute expires_at if possible
    expires_at: Optional[dt.datetime] = None
    if "expires_at" in token and token["expires_at"]:
        try:
            # some libs store as epoch seconds
            expires_at = dt.datetime.utcfromtimestamp(int(token["expires_at"]))
        except Exception:
            expires_at = None
    elif "expires_in" in token and token["expires_in"]:
        try:
            expires_at = dt.datetime.utcnow() + dt.timedelta(seconds=int(token["expires_in"]))
        except Exception:
            expires_at = None

    # Normalize scopes to a list
    scopes_val = token.get("scope") or []
    if isinstance(scopes_val, str):
        scopes_list = [s for s in scopes_val.split() if s]
    elif isinstance(scopes_val, (list, tuple)):
        scopes_list = list(scopes_val)
    else:
        scopes_list = []

    # Ensure platform + account + credential
    yt = _ensure_youtube_platform(session)
    pa = _ensure_platform_account(session, user, yt)
    try:
        cred = _upsert_oauth_credential(session, pa.id, access_token, refresh_token, scopes_list, expires_at)
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=400)

    # --- Discover channels and upsert into 'channel' + link via 'user_channel' ---
    header_access_token = access_token
    if not header_access_token and getattr(cred, "access_token_encrypted", None):
        try:
            header_access_token = decrypt_str(cred.access_token_encrypted)
        except Exception:
            header_access_token = None

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
                ch_id = item.get("id")
                snippet = item.get("snippet", {}) or {}
                title = snippet.get("title")
                published_at = snippet.get("publishedAt")
                custom_url = snippet.get("customUrl")
                country = snippet.get("country")
                thumb = None
                thumbs = snippet.get("thumbnails") or {}
                for key in ("high", "medium", "default"):
                    if key in thumbs and "url" in thumbs[key]:
                        thumb = thumbs[key]["url"]
                        break

                # Upsert Channel by (platform_id, external_channel_id)
                ch = session.exec(
                    select(Channel).where(
                        Channel.platform_id == yt.id,
                        Channel.external_channel_id == ch_id,
                    )
                ).first()
                if not ch:
                    ch = Channel(
                        platform_id=yt.id,
                        platform_account_id=pa.id,
                        external_channel_id=ch_id,
                        title=title,
                        description=snippet.get("description"),
                        country=country,
                        language=None,  # not provided by this API call
                        custom_url=custom_url,
                        avatar_url=thumb,
                        banner_url=None,  # need brandingSettings part for banner
                        is_monetized=None,  # not provided here
                        published_at=published_at,
                        last_synced_at=None,
                        is_active=True,
                    )
                    session.add(ch)
                    session.commit()
                    session.refresh(ch)
                else:
                    # update mutable fields / re-link to latest platform account
                    ch.platform_account_id = pa.id
                    ch.title = title or ch.title
                    ch.description = snippet.get("description") or ch.description
                    ch.country = country or ch.country
                    ch.custom_url = custom_url or ch.custom_url
                    ch.avatar_url = thumb or ch.avatar_url
                    ch.is_active = True
                    session.add(ch)
                    session.commit()

                _link_user_channel_owner(session, user.id, ch.id)
        except Exception:
            # Don't block login if discovery fails
            pass

    next_url = request.session.pop("post_oauth_next", None) or "/ui/dashboard.html?linked=1"
    return RedirectResponse(url=next_url, status_code=307)

# ---------- misc ----------

@router.get("/connected")
def connected(user_id: int = Depends(require_user_id)):
    return {"ok": True, "user_id": user_id}

# Optional debug for Google connection (new-schema version)
@router.get("/me/google")
def me_google(
    user_id: int = Depends(require_user_id),
    session: Session = Depends(get_session),
):
    yt = session.exec(select(Platform).where(Platform.name == "youtube")).first()
    if not yt:
        return {"ok": False, "reason": "no youtube platform", "user_id": user_id}

    pa = session.exec(
        select(PlatformAccount).where(
            PlatformAccount.platform_id == yt.id, PlatformAccount.owner_user_id == user_id
        )
    ).first()
    if not pa:
        return {"ok": False, "reason": "no platform account", "user_id": user_id}

    cred = session.exec(
        select(OAuthCredential).where(OAuthCredential.platform_account_id == pa.id)
    ).first()

    return {
        "ok": True,
        "user_id": user_id,
        "platform_account_id": pa.id,
        "has_access_token": bool(getattr(cred, "access_token_encrypted", None)) if cred else False,
        "has_refresh_token": bool(getattr(cred, "refresh_token_encrypted", None)) if cred else False,
        "expires_at": str(getattr(cred, "expires_at", None)) if cred else None,
    }

# ----------------------------
# Local auth: signup/login/logout
# ----------------------------

class SignupIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

@router.post("/signup")
def signup(body: SignupIn, req: Request, session: Session = Depends(get_session)):
    email = body.email.lower().strip()

    # Uniqueness check
    if session.exec(select(User).where(User.email == email)).first():
        return JSONResponse({"detail": "email already registered"}, status_code=400)

    u = User(email=email, name=(body.name or None), password_hash=hash_password(body.password))
    session.add(u)
    session.commit()
    session.refresh(u)
    req.session["user_id"] = u.id
    return {"ok": True, "user_id": u.id, "email": u.email}

@router.post("/login")
def login(body: LoginIn, req: Request, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.email.lower().strip())).first()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        return JSONResponse({"detail": "invalid credentials"}, status_code=401)
    req.session["user_id"] = user.id
    return {"ok": True, "user_id": user.id, "email": user.email}

@router.post("/logout")
def logout(req: Request):
    req.session.pop("user_id", None)
    return {"ok": True}

# ----------------------------
# Me
# ----------------------------

@router.get("/me")
def me(user_id: int = Depends(require_user_id), session: Session = Depends(get_session)):
    u = session.get(User, user_id)
    return {
        "ok": True,
        "user_id": user_id,
        "email": getattr(u, "email", None),
        "name": getattr(u, "name", None),
        # legacy fields removed in new schema:
        "link_quota": None,
        "manual_refresh_date": None,
        "manual_refresh_count": 0,
    }
