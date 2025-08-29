from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from ..db.core import get_session
from ..db.models import User

router = APIRouter(prefix="/test", tags=["test"])

@router.post("/seed")
def seed_user(session: Session = Depends(get_session)):
    u = User(email="seed@example.com")
    session.add(u)
    session.commit()
    session.refresh(u)
    return {"id": u.id, "email": u.email}

@router.get("/users")
def list_users(session: Session = Depends(get_session)):
    return session.exec(select(User)).all()
