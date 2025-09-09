import sqlite3, sys
if len(sys.argv) < 3:
    print("Usage: python scripts\\dump_sqlite_schema.py <dev.db> <mode>", file=sys.stderr)
    print("Modes: all | tables | tables_indexes | table:<name>", file=sys.stderr)
    raise SystemExit(1)
db = sys.argv[1]; mode = sys.argv[2]
con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)  # READ-ONLY
if mode == "all":
    q = """SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name"""
elif mode == "tables":
    q = """SELECT sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"""
elif mode == "tables_indexes":
    q = """SELECT sql FROM sqlite_schema WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type, name"""
elif mode.startswith("table:"):
    name = mode.split(":",1)[1]
    rows = con.execute("SELECT sql FROM sqlite_schema WHERE name = ? AND sql IS NOT NULL", (name,)).fetchall()
    print(";\n".join(r[0] for r in rows if r[0]), end=";\n"); raise SystemExit(0)
else:
    print(f"Unknown mode: {mode}", file=sys.stderr); raise SystemExit(2)
rows = con.execute(q).fetchall()
print(";\n".join(r[0] for r in rows if r[0]), end=";\n")
