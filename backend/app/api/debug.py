# app/api/debug.py
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from ..db.core import get_session
from ..db.models import GoogleAccount, User

router = APIRouter(prefix="/debug", tags=["debug"])

@router.get("/googleaccounts")
def list_googleaccounts(session: Session = Depends(get_session)):
    rows = session.exec(select(GoogleAccount)).all()
    return [
        {
            "id": g.id,
            "user_id": g.user_id,
            "email": g.email,
            "has_refresh": bool(g.refresh_token),
            "created_at": str(g.created_at) if getattr(g, "created_at", None) else None,
        }
        for g in rows
    ]

@router.get("/users")
def list_users(session: Session = Depends(get_session)):
    rows = session.exec(select(User)).all()
    return [{"id": u.id, "email": u.email} for u in rows]
