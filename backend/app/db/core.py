# backend/app/db/core.py
from sqlmodel import SQLModel, create_engine, Session
from ..core.settings import settings


def _get_db_url() -> str:
    # Accept both lowercase and uppercase env-backed attributes
    return (
        getattr(settings, "database_url", None)
        or getattr(settings, "DATABASE_URL", None)
        or "sqlite:///./app.db"  # default for local dev
    )


DATABASE_URL = _get_db_url()

# Needed for SQLite; harmless for others if left empty
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# Turn echo to True if you want to see SQL in logs
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def create_db_and_tables() -> None:
    """Create tables if they do not exist."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency."""
    with Session(engine) as session:
        yield session
