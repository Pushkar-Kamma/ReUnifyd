# backend/app/db/core.py
import os
from sqlmodel import SQLModel, create_engine, Session
from ..core.settings import settings
from sqlalchemy import event

def _normalize_sqlite_url(url: str) -> str:
    """Ensure relative SQLite URLs resolve consistently to the backend directory.

    If the URL looks like sqlite:///./<name>.db, anchor it to the repo's backend
    directory so the same DB is used whether uvicorn runs from repo root or backend/.
    """
    if not url.startswith("sqlite"):
        return url
    # Only adjust obvious relative form sqlite:///./...
    prefix = "sqlite:///./"
    if url.startswith(prefix):
        name = url[len(prefix):]
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        db_path = os.path.join(backend_dir, name)
        # Normalize to posix-style path for SQLAlchemy
        db_path = db_path.replace("\\", "/")
        return f"sqlite:///{db_path}"
    return url


def _get_db_url() -> str:
    # Accept both lowercase and uppercase env-backed attributes
    raw = (
        getattr(settings, "database_url", None)
        or getattr(settings, "DATABASE_URL", None)
        or "sqlite:///./dev.db"  # default for local dev (unified)
    )
    return _normalize_sqlite_url(raw)


DATABASE_URL = _get_db_url()

# Needed for SQLite; harmless for others if left empty
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# Turn echo to True if you want to see SQL in logs
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)
# Turn on SQLite pragmas for every new DB connection
if engine.url.get_backend_name() == "sqlite":
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        # REQUIRED: actually enforce your FOREIGN KEY constraints
        cur.execute("PRAGMA foreign_keys=ON;")
        # Optional but recommended: better concurrency / fewer "database is locked"
        # Only set WAL if this is a file-based DB (not :memory:)
        if engine.url.database not in (None, "", ":memory:"):
            cur.execute("PRAGMA journal_mode=WAL;")
            cur.execute("PRAGMA synchronous=NORMAL;")
        cur.close()

def get_session():
    """FastAPI dependency."""
    with Session(engine) as session:
        yield session
