# backend/drop_schema.py
import os, sys
from sqlalchemy import create_engine, text, event, MetaData

def _normalize_sqlite_url(url: str) -> str:
    """Anchor sqlite:///./*.db to the backend/ directory."""
    if not url.startswith("sqlite"):
        return url
    prefix = "sqlite:///./"
    if url.startswith(prefix):
        name = url[len(prefix):]
        backend_dir = os.path.abspath(os.path.dirname(__file__))
        db_path = os.path.join(backend_dir, name).replace("\\", "/")
        return f"sqlite:///{db_path}"
    return url

# Default to backend/dev.db if env missing
raw_url = os.environ.get("DATABASE_URL", "sqlite:///./dev.db")
url = _normalize_sqlite_url(raw_url)

engine = create_engine(url)

# Helpful pragmas for SQLite
if engine.url.get_backend_name() == "sqlite":
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON;")
        if engine.url.database not in (None, "", ":memory:"):
            cur.execute("PRAGMA journal_mode=WAL;")
            cur.execute("PRAGMA synchronous=NORMAL;")
        cur.close()

dialect = engine.url.get_backend_name()

if dialect in ("postgresql", "postgres"):
    # Keep Postgres behaviour for completeness
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE;"))
        conn.execute(text("CREATE SCHEMA public;"))
    print("Dropped and recreated schema 'public' (Postgres).")
elif dialect == "sqlite":
    db_path = engine.url.database
    if db_path and db_path not in ("", ":memory:"):
        engine.dispose()
        try:
            # Remove DB and sidecar files if present
            os.remove(db_path)
            for sidecar in (db_path + "-wal", db_path + "-shm"):
                try: os.remove(sidecar)
                except FileNotFoundError: pass
            print(f"Removed SQLite database file: {db_path}")
        except FileNotFoundError:
            print(f"SQLite database file not found (already gone): {db_path}")
    else:
        # In-memory: drop all objects
        md = MetaData()
        md.reflect(bind=engine)
        with engine.begin() as conn:
            md.drop_all(bind=conn)
        print("Dropped all objects from in-memory SQLite.")
else:
    md = MetaData()
    md.reflect(bind=engine)
    with engine.begin() as conn:
        md.drop_all(bind=conn)
    print(f"Dropped all reflected objects for dialect '{dialect}'.")

print(f"OK. Used DATABASE_URL='{url}' (from '{raw_url}')")
