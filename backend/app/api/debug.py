# app/api/debug.py
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from sqlalchemy import func

from ..db.core import get_session
from ..db.models import (
    User,
    Platform,
    PlatformAccount,
    OAuthCredential,  # NOTE: ensure this matches your class name; use OauthCredential if that's what you defined
    Channel,
)

router = APIRouter(prefix="/debug", tags=["debug"])

@router.get("/googleaccounts")
def list_googleaccounts(session: Session = Depends(get_session)):
    # New schema: PlatformAccount (+ OAuthCredential), optionally linked to Channels
    rows = session.exec(
        select(PlatformAccount, Platform)
        .join(Platform, Platform.id == PlatformAccount.platform_id)
    ).all()

    out = []
    for pa, platform in rows:
        cred = session.exec(
            select(OAuthCredential).where(
                OAuthCredential.platform_account_id == pa.id
            )
        ).first()

        # FIX: get scalar int instead of a tuple
        channels_count = session.exec(
            select(func.count()).select_from(Channel).where(
                Channel.platform_account_id == pa.id
            )
        ).scalar_one()

        out.append({
            "id": pa.id,
            "user_id": pa.owner_user_id,
            "platform": platform.name,
            "display_name": getattr(pa, "display_name", None),
            "has_refresh": bool(getattr(cred, "refresh_token_encrypted", None)),
            "expires_at": str(getattr(cred, "expires_at", "")) if cred else None,
            "created_at": str(getattr(pa, "created_at", "")) if getattr(pa, "created_at", None) else None,
            "channels_count": channels_count,
            # Kept for loose compatibility with old payloads; not stored in new schema:
            "email": None,
        })
    return out

@router.get("/users")
def list_users(session: Session = Depends(get_session)):
    rows = session.exec(select(User)).all()
    return [{"id": u.id, "email": u.email} for u in rows]

@router.post("/reset-refresh")
def reset_refresh(session: Session = Depends(get_session)):
    # Legacy no-op: fields likely don't exist in new schema; guarded by hasattr
    rows = session.exec(select(User)).all()
    for u in rows:
        if hasattr(u, "manual_refresh_date"):
            u.manual_refresh_date = None
        if hasattr(u, "manual_refresh_count"):
            u.manual_refresh_count = 0
        session.add(u)
    session.commit()
    return {"ok": True, "reset_users": len(rows)}
