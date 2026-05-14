# backend/app/api/auth_google.py
from __future__ import annotations

import datetime as dt

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlmodel import Session, select

from app.api.deps import require_user_id
from app.core.crypto import decrypt_str, encrypt_str

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

router = APIRouter(prefix="/auth/google", tags=["auth-google"])

def _parse_google_datetime(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
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
            url = entry.get("url")
            if url:
                return url
    for entry in thumbnails.values():
        if isinstance(entry, dict):
            url = entry.get("url")
            if url:
                return url
    return None

def _normalize_scopes(value) -> str | None:
    if not value:
        return None
    if isinstance(value, str):
        scopes = [s for s in value.split() if s]
    elif isinstance(value, (list, tuple, set)):
        scopes = [str(s) for s in value if s]
    else:
        return None
    return " ".join(sorted(set(scopes))) if scopes else None

def _compute_expires_at(token: dict) -> dt.datetime | None:
    if not token:
        return None
    expires_at = token.get("expires_at")
    if expires_at:
        try:
            return dt.datetime.utcfromtimestamp(int(expires_at))
        except Exception:
            try:
                return dt.datetime.fromisoformat(str(expires_at))
            except Exception:
                return None
    expires_in = token.get("expires_in")
    if expires_in:
        try:
            return dt.datetime.utcnow() + dt.timedelta(seconds=int(expires_in))
        except Exception:
            return None
    return None

@router.get("/init")
async def google_init(
    request: Request,
    next: str = "/ui/link.html",
    plan: str | None = None,
):
    request.session["post_oauth_next"] = next
    if plan:
        request.session["post_oauth_plan"] = plan
    return await oauth.google.authorize_redirect(
        request,
        request.app.state.oauth_redirect,  # set in main.py via init_oauth
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )

@router.get("/callback")
async def google_callback(
    request: Request,
    session: Session = Depends(get_session),
    user_id: int = Depends(require_user_id),
):
    if (err := request.query_params.get("error")):
        return RedirectResponse(url=f"/ui/link.html?oauth_error={err}", status_code=303)

    # Exchange code → tokens (Authlib)
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as exc:
        return RedirectResponse(url=f"/ui/link.html?oauth_error={exc}", status_code=303)

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="user not found")

    userinfo = token.get("userinfo")
    if not userinfo:
        try:
            userinfo = await oauth.google.parse_id_token(request, token)
        except Exception:
            userinfo = None

    google_email = (userinfo or {}).get("email")
    if isinstance(google_email, str):
        google_email = google_email.lower()
    google_sub = (userinfo or {}).get("sub")
    account_key = google_email or (f"sub:{google_sub}" if google_sub else None)
    if not account_key:
        raise HTTPException(status_code=400, detail="unable to determine google account identity")

    platform = session.exec(select(Platform).where(Platform.name == "youtube")).first()
    if not platform:
        raise HTTPException(status_code=400, detail="youtube platform not configured")

    pa = session.exec(
        select(PlatformAccount).where(
            PlatformAccount.owner_user_id == user.id,
            PlatformAccount.platform_id == platform.id,
            PlatformAccount.display_name == account_key,
        )
    ).first()
    if not pa:
        pa = PlatformAccount(
            owner_user_id=user.id,
            platform_id=platform.id,
            display_name=account_key,
        )
        session.add(pa)
        session.commit()
        session.refresh(pa)

    access_token = token.get("access_token")
    refresh_token = token.get("refresh_token")
    scopes_str = _normalize_scopes(token.get("scope"))
    expires_at = _compute_expires_at(token)

    cred = session.exec(
        select(OAuthCredential).where(OAuthCredential.platform_account_id == pa.id)
    ).first()
    if not cred:
        if not refresh_token:
            return RedirectResponse(
                url="/ui/link.html?oauth_error=missing_refresh_token_reconsent",
                status_code=303,
            )
        if not access_token:
            return RedirectResponse(
                url="/ui/link.html?oauth_error=missing_access_token",
                status_code=303,
            )
        cred = OAuthCredential(
            platform_account_id=pa.id,
            access_token_encrypted=encrypt_str(access_token),
            refresh_token_encrypted=encrypt_str(refresh_token),
            scopes=scopes_str,
            expires_at=expires_at,
        )
        session.add(cred)
    else:
        if access_token:
            cred.access_token_encrypted = encrypt_str(access_token)
        if refresh_token:
            cred.refresh_token_encrypted = encrypt_str(refresh_token)
        if scopes_str:
            cred.scopes = scopes_str
        if expires_at is not None:
            cred.expires_at = expires_at
        session.add(cred)
    session.commit()
    session.refresh(cred)

    header_access_token = access_token
    if not header_access_token and getattr(cred, "access_token_encrypted", None):
        try:
            header_access_token = decrypt_str(cred.access_token_encrypted)
        except Exception:
            header_access_token = None

    # Fetch channels, upsert them, and link to the current user
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
                headers={"Authorization": f"Bearer {header_access_token}"},
            )
        resp.raise_for_status()
        data = resp.json()
        return data.get("items", [])

    try:
        items = await _fetch_youtube_channels(header_access_token)
    except Exception:
        return RedirectResponse(url="/ui/link.html?oauth_error=channel_sync_failed", status_code=303)

    seen_channel_ids: set[str] = set()
    for item in items:
        channel_id = item.get("id")
        if not channel_id or channel_id in seen_channel_ids:
            continue
        seen_channel_ids.add(channel_id)

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
                Channel.platform_id == platform.id,
                Channel.external_channel_id == channel_id,
            )
        ).first()

        if not ch:
            ch = Channel(
                platform_id=platform.id,
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
                last_synced_at=dt.datetime.utcnow(),
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
            ch.last_synced_at = dt.datetime.utcnow()
            session.add(ch)
            session.flush()

        uc = session.exec(
            select(UserChannel).where(
                UserChannel.user_id == user.id,
                UserChannel.channel_id == ch.id,
            )
        ).first()
        if not uc:
            session.add(UserChannel(user_id=user.id, channel_id=ch.id, role="owner"))
            session.flush()

    session.commit()

    # Redirect back so link.html refetches and price updates
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
