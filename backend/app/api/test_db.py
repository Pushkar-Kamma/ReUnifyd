from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db.core import get_session
from ..db.models import User

router = APIRouter(prefix="/test", tags=["test"])

@router.post("/seed")
def seed_user(session: Session = Depends(get_session)):
    email = "seed@example.com"
    u = session.exec(select(User).where(User.email == email)).first()
    if not u:
        u = User(email=email, name="Seed User")
        session.add(u)
        session.commit()
        session.refresh(u)
    return {"id": u.id, "email": u.email}

@router.get("/users")
def list_users(session: Session = Depends(get_session)):
    # Never return raw User rows (they include password_hash). Dev-only route.
    rows = session.exec(select(User)).all()
    return [{"id": u.id, "email": u.email, "name": u.name} for u in rows]
