# dump_sqlite_schema.py
import os
import sqlite3
import sys

USAGE = """\
Usage: python dump_sqlite_schema.py <db_path> <mode>
Modes:
  all                        # tables, indexes, triggers, views (everything with SQL)
  tables                     # only CREATE TABLE
  indexes                    # only CREATE INDEX
  triggers                   # only CREATE TRIGGER
  tables_indexes             # tables + indexes
  tables_indexes_triggers    # tables + indexes + triggers
  table:<name>               # dump a single object by exact name
"""

def main():
    if len(sys.argv) < 2:
        print(USAGE, file=sys.stderr)
        raise SystemExit(1)

    db = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) >= 3 else "all"

    if not (db.startswith("file:") or os.path.exists(db)):
        print(f"ERROR: DB file not found: {db}", file=sys.stderr)
        raise SystemExit(2)

    # read-only connection; allow db to be either a plain path or a sqlite URI
    uri = db if db.startswith("file:") else f"file:{db}?mode=ro"
    con = sqlite3.connect(uri, uri=True)

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
            print(f"-- No SQL found for object named '{name}'", file=sys.stderr)
            print("", end="")
            raise SystemExit(0)
        print(";\n".join(r[0] for r in rows if r[0]), end=";\n")
        raise SystemExit(0)
    else:
        print(f"Unknown mode: {mode}\n\n{USAGE}", file=sys.stderr)
        raise SystemExit(2)

    rows = con.execute(q, params).fetchall()
    print(";\n".join(r[0] for r in rows if r[0]), end=";\n")

if __name__ == "__main__":
    main()
