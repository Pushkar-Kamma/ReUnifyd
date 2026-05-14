import os
import sqlite3
from pathlib import Path

# --- CONFIG ---
DATABASE_FILE = 'backend/dev.db'  # <- keep your file name here
TABLES = [
    "channel",
    "channel_daily_metrics",
    "channel_hourly_metrics",
    "oauth_credential",
    "platform",
    "platform_account",
    "user",
    "user_channel",
    "video",
    "video_daily_metrics",
    "video_hourly_metrics",
]

def table_exists(cur, name: str) -> bool:
    cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?;", (name,))
    return cur.fetchone() is not None

def main():
    # Resolve absolute DB path to avoid accidental creation of a new file
    db_path = Path(DATABASE_FILE).expanduser().resolve()

    print("=== Debug info ===")
    print("cwd:", os.getcwd())
    print("database_file (as given):", DATABASE_FILE)
    print("resolved absolute path  :", str(db_path))

    # Connect once, reuse cursor
    try:
        with sqlite3.connect(str(db_path)) as conn:
            cur = conn.cursor()

            # What DBs are attached?
            cur.execute("PRAGMA database_list;")
            print("attached dbs:", cur.fetchall())

            # What tables does SQLite think exist?
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
            all_tables = [r[0] for r in cur.fetchall()]
            print("tables seen:", all_tables)

            # If you have FK relationships and just want to wipe rows, disabling can help
            # cur.execute("PRAGMA foreign_keys = OFF;")

            for t in TABLES:
                if not table_exists(cur, t):
                    print(f"[SKIP] No such table: {t}")
                    continue
                try:
                    cur.execute(f'''DELETE FROM "{t}";''')  # quote the table name
                    print(f"[OK] Cleared table: {t}")
                except sqlite3.Error as e:
                    print(f"[ERR] While deleting from {t}: {e}")

            # cur.execute("PRAGMA foreign_keys = ON;")
            conn.commit()
            print("=== Done ===")

    except sqlite3.Error as e:
        print(f"[FATAL] Could not open DB or run queries: {e}")

if __name__ == "__main__":
    main()
