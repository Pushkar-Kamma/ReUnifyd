# app/api/auth.py
from __future__ import annotations

import datetime as dt

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from app.api.deps import require_user_id
from app.core.crypto import decrypt_str, encrypt_str  # Fernet helpers you kept
from app.core.security import hash_password, verify_password

from ..db.core import get_session
from ..db.models import (
    Channel,
    OAuthCredential,
    Platform,
    PlatformAccount,
    User,
    UserChannel,
)
from ..services.google_oauth import oauth

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


def _normalize_scopes(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        return [s for s in value.split() if s]
    if isinstance(value, (list, tuple, set)):
        return [str(s) for s in value if s]
    return []

def _parse_google_datetime(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except Exception:
        return None

def _normalize_country_code(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().upper()[:2]

def _normalize_language_code(value: str | None) -> str | None:
    if not value:
        return None
    return value.split('-', 1)[0].strip().lower()[:2]

def _select_thumbnail(thumbnails) -> str | None:
    if not thumbnails or not isinstance(thumbnails, dict):
        return None
    for key in ('high', 'medium', 'default'):
        entry = thumbnails.get(key) or {}
        if isinstance(entry, dict):
            url = entry.get('url')
            if url:
                return url
    for entry in thumbnails.values():
        if isinstance(entry, dict):
            url = entry.get('url')
            if url:
                return url
    return None

def _compute_expires_at(token: dict) -> dt.datetime | None:
    if not token:
        return None
    expires_at = token.get('expires_at')
    if expires_at:
        try:
            return dt.datetime.utcfromtimestamp(int(expires_at))
        except Exception:
            try:
                return dt.datetime.fromisoformat(str(expires_at))
            except Exception:
                return None
    expires_in = token.get('expires_in')
    if expires_in:
        try:
            return dt.datetime.utcnow() + dt.timedelta(seconds=int(expires_in))
        except Exception:
            return None
    return None

def _get_or_create_platform_account(
    session: Session,
    user: User,
    platform: Platform,
    account_key: str,
) -> PlatformAccount:
    pa = session.exec(
        select(PlatformAccount).where(
            PlatformAccount.platform_id == platform.id,
            PlatformAccount.owner_user_id == user.id,
            PlatformAccount.display_name == account_key,
        )
    ).first()
    if not pa:
        pa = PlatformAccount(
            platform_id=platform.id,
            owner_user_id=user.id,
            display_name=account_key,
        )
        session.add(pa)
        session.commit()
        session.refresh(pa)
    return pa

def _upsert_oauth_credential(
    session: Session,
    platform_account_id: int,
    access_token: str | None,
    refresh_token: str | None,
    scopes_list: list[str],
    expires_at: dt.datetime | None,
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
        session.flush()

# ---------- OAuth: init & callback ----------

@router.get("/google/init")
async def google_init(request: Request, session: Session = Depends(get_session)):
    # Remember where to return after linking
    next_url = request.query_params.get("next") or "/ui/link.html"
    request.session["post_oauth_next"] = next_url

    plan = request.query_params.get("plan")
    if plan and plan.lower() in {"basic", "creator", "pro"}:
        request.session["post_oauth_plan"] = plan.lower()

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
    if (err := request.query_params.get("error")):
        return RedirectResponse(url=f"/ui/link.html?oauth_error={err}", status_code=303)

    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as exc:
        return RedirectResponse(url=f"/ui/link.html?oauth_error={exc}", status_code=303)

    userinfo = token.get("userinfo")
    if not userinfo:
        try:
            userinfo = await oauth.google.parse_id_token(request, token)
        except Exception:
            userinfo = None
    if not userinfo:
        try:
            resp = await oauth.google.get(
                "https://openidconnect.googleapis.com/v1/userinfo", token=token
            )
            userinfo = resp.json()
        except Exception:
            userinfo = None

    email = ((userinfo or {}).get("email") or "").lower() or None
    sub = (userinfo or {}).get("sub") or None
    account_key = email or (f"sub:{sub}" if sub else None)
    if not account_key:
        return JSONResponse({"detail": "unable to determine google account identity"}, status_code=400)

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

    refresh_token = token.get("refresh_token")
    access_token = token.get("access_token")
    expires_at = _compute_expires_at(token)
    scopes_list = _normalize_scopes(token.get("scope"))

    yt = _ensure_youtube_platform(session)
    pa = _get_or_create_platform_account(session, user, yt, account_key)
    try:
        cred = _upsert_oauth_credential(session, pa.id, access_token, refresh_token, scopes_list, expires_at)
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)

    header_access_token = access_token
    if not header_access_token and getattr(cred, "access_token_encrypted", None):
        try:
            header_access_token = decrypt_str(cred.access_token_encrypted)
        except Exception:
            header_access_token = None

    async def _fetch_youtube_channels(token: str) -> list[dict]:
        params = {
            "part": "snippet,contentDetails,statistics,brandingSettings",
            "mine": "true",
            "maxResults": 50,
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
        resp.raise_for_status()
        data = resp.json()
        return data.get("items", [])

    items: list[dict] = []
    if header_access_token:
        try:
            items = await _fetch_youtube_channels(header_access_token)
        except Exception:
            items = []

    seen: set[str] = set()
    now = dt.datetime.utcnow()
    for item in items:
        channel_id = item.get("id")
        if not channel_id or channel_id in seen:
            continue
        seen.add(channel_id)

        snippet = item.get("snippet") or {}
        branding = item.get("brandingSettings") or {}
        branding_channel = branding.get("channel") or {}
        branding_image = branding.get("image") or {}
        status = item.get("status") or {}
        statistics = item.get("statistics") or {}
        subscriber_count = None
        try:
            if statistics.get("subscriberCount") is not None:
                subscriber_count = int(statistics.get("subscriberCount"))
        except (TypeError, ValueError):
            subscriber_count = None

        title = snippet.get("title") or branding_channel.get("title")
        description = snippet.get("description")
        country = _normalize_country_code(snippet.get("country"))
        language = _normalize_language_code(
            branding_channel.get("defaultLanguage") or snippet.get("defaultLanguage")
        )
        custom_url = snippet.get("customUrl") or branding_channel.get("customUrl")
        avatar_url = _select_thumbnail(snippet.get("thumbnails"))
        banner_url = branding_image.get("bannerExternalUrl")
        published_at = _parse_google_datetime(snippet.get("publishedAt"))
        is_monetized = status.get("isLinked")

        ch = session.exec(
            select(Channel).where(
                Channel.platform_id == yt.id,
                Channel.external_channel_id == channel_id,
            )
        ).first()

        if not ch:
            ch = Channel(
                platform_id=yt.id,
                platform_account_id=pa.id,
                external_channel_id=channel_id,
                title=title,
                description=description,
                country=country,
                language=language,
                custom_url=custom_url,
                avatar_url=avatar_url,
                banner_url=banner_url,
                subscriber_count=subscriber_count,
                is_monetized=is_monetized,
                is_active=True,
                published_at=published_at,
                last_synced_at=now,
            )
            session.add(ch)
            session.flush()
        else:
            ch.platform_account_id = pa.id
            ch.title = title or ch.title
            ch.description = description or ch.description
            ch.country = country or ch.country
            ch.language = language or ch.language
            ch.custom_url = custom_url or ch.custom_url
            if published_at and not ch.published_at:
                ch.published_at = published_at
            if avatar_url:
                ch.avatar_url = avatar_url
            if banner_url:
                ch.banner_url = banner_url
            if subscriber_count is not None:
                ch.subscriber_count = subscriber_count
            if is_monetized is not None:
                ch.is_monetized = is_monetized
            ch.is_active = True
            ch.last_synced_at = now
            session.add(ch)
            session.flush()

        _link_user_channel_owner(session, user.id, ch.id)

    session.commit()

    next_url = (
        request.session.pop("post_oauth_next", None)
        or request.query_params.get("next")
        or "/ui/link.html"
    )
    plan = (
        request.session.pop("post_oauth_plan", None)
        or request.query_params.get("plan")
    )
    sep = "&" if "?" in next_url else "?"
    params = []
    if plan:
        params.append(f"plan={plan}")
    params.append("linked=1")
    redirect_target = f"{next_url}{sep}{'&'.join(params)}"
    return RedirectResponse(redirect_target, status_code=303)

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
    name: str | None = None

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
