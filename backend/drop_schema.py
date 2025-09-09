# backend/drop_schema.py
import os
from sqlalchemy import event
from sqlalchemy import create_engine, text
url = os.environ["DATABASE_URL"]
engine = create_engine(url)
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

with engine.begin() as conn:
    conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
print("Dropped and recreated schema 'public'.")
