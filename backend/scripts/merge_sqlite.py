import os
import sqlite3
from pathlib import Path


def merge_sqlite(source: Path, target: Path) -> None:
    if not source.exists():
        print(f"Source not found: {source}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    tgt_new = not target.exists()

    # Attach both DBs and copy rows table-by-table if table names match
    con = sqlite3.connect(str(target))
    con.execute("PRAGMA foreign_keys=OFF")
    con.row_factory = sqlite3.Row
    try:
        con.execute(f"ATTACH DATABASE '{source.as_posix()}' AS src")
        # Find tables
        tgt_tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        src_tables = {r[0] for r in con.execute("SELECT name FROM src.sqlite_master WHERE type='table'")}
        tables = sorted((tgt_tables | src_tables))

        # Create missing tables in target from source DDL
        for t in tables:
            if t not in tgt_tables and t in src_tables:
                row = con.execute(
                    "SELECT sql FROM src.sqlite_master WHERE type='table' AND name=?",
                    (t,),
                ).fetchone()
                if row and row[0]:
                    con.execute(row[0])

        # Copy rows (naive: delete targets then insert all) using common columns
        for t in tables:
            if t.startswith('alembic_version'):
                continue
            if t not in src_tables:
                continue
            try:
                con.execute(f"DELETE FROM {t}")
            except Exception:
                pass

            src_cols = [r[1] for r in con.execute(f"PRAGMA src.table_info({t})").fetchall()]
            tgt_cols = [r[1] for r in con.execute(f"PRAGMA table_info({t})").fetchall()]
            if not src_cols or not tgt_cols:
                continue
            common = [c for c in src_cols if c in tgt_cols]
            if not common:
                continue
            collist = ",".join(common)
            con.execute(
                f"INSERT INTO {t} ({collist}) SELECT {collist} FROM src.{t}"
            )
        con.commit()
        print(f"Merged tables from {source} into {target}")
    finally:
        con.close()


if __name__ == "__main__":
    here = Path(__file__).resolve().parent.parent
    # Default canonical target
    target = here / "dev.db"
    # Migrate from app.db if it exists
    appdb = here / "app.db"
    if appdb.exists():
        merge_sqlite(appdb, target)
    else:
        print("Nothing to merge; app.db not found.")
