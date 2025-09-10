# scripts/dump_sqlite_schema.py
import sqlite3
import sys
import os

USAGE = """\
Usage: python scripts\\dump_sqlite_schema.py <db_path> <mode>
Modes:
  all                        # everything with SQL (tables, indexes, triggers, views)
  tables                     # only CREATE TABLE statements
  indexes                    # only CREATE INDEX statements
  triggers                   # only CREATE TRIGGER statements
  tables_indexes             # tables + indexes (OLD behavior)
  tables_indexes_triggers    # tables + indexes + triggers (useful for full SQLite schema)
  table:<name>               # dump a single object by exact name
"""

def main():
    if len(sys.argv) < 2:
        print(USAGE, file=sys.stderr)
        raise SystemExit(1)

    db = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) >= 3 else "all"

    # Basic sanity: make relative paths obvious
    if not (db.startswith("file:") or os.path.exists(db)):
        print(f"ERROR: DB file not found: {db}", file=sys.stderr)
        raise SystemExit(2)

    # Open READ-ONLY; allow both plain path and URI (if caller passed one)
    uri = db if db.startswith("file:") else f"file:{db}?mode=ro"
    con = sqlite3.connect(uri, uri=True)

    # Build query per mode. We exclude sqlite_ internal objects and rows with NULL sql.
    if mode == "all":
        q = """
            SELECT sql
            FROM sqlite_schema
            WHERE sql IS NOT NULL
              AND name NOT LIKE 'sqlite_%'
            ORDER BY type, name
        """
        params = ()

    elif mode == "tables":
        q = """
            SELECT sql
            FROM sqlite_schema
            WHERE type='table'
              AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        """
        params = ()

    elif mode == "indexes":
        q = """
            SELECT sql
            FROM sqlite_schema
            WHERE type='index'
              AND sql IS NOT NULL
              AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        """
        params = ()

    elif mode == "triggers":
        q = """
            SELECT sql
            FROM sqlite_schema
            WHERE type='trigger'
              AND sql IS NOT NULL
              AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        """
        params = ()

    elif mode == "tables_indexes":
        q = """
            SELECT sql
            FROM sqlite_schema
            WHERE type IN ('table','index')
              AND sql IS NOT NULL
              AND name NOT LIKE 'sqlite_%'
            ORDER BY type, name
        """
        params = ()

    elif mode == "tables_indexes_triggers":
        q = """
            SELECT sql
            FROM sqlite_schema
            WHERE type IN ('table','index','trigger')
              AND sql IS NOT NULL
              AND name NOT LIKE 'sqlite_%'
            ORDER BY type, name
        """
        params = ()

    elif mode.startswith("table:"):
        name = mode.split(":", 1)[1]
        rows = con.execute(
            "SELECT sql FROM sqlite_schema WHERE name = ? AND sql IS NOT NULL",
            (name,),
        ).fetchall()
        if not rows:
            # Be explicit if nothing found; helpful during migrations
            print(f"-- No SQL found for object named '{name}'", file=sys.stderr)
            print("", end="")  # no stdout schema
            raise SystemExit(0)
        print(";\n".join(r[0] for r in rows if r[0]), end=";\n")
        raise SystemExit(0)

    else:
        print(f"Unknown mode: {mode}\n\n{USAGE}", file=sys.stderr)
        raise SystemExit(2)

    rows = con.execute(q, params).fetchall()
    # Print joined SQL statements, each terminated with semicolon.
    # (Some objects—esp. auto indexes—have NULL sql; we filtered those above.)
    print(";\n".join(r[0] for r in rows if r[0]), end=";\n")

if __name__ == "__main__":
    main()
