# backend/scripts/clean_user_data.py
"""
Utility to wipe all user data (users, connected accounts, channels, videos, metrics)
from the local dev database. Keeps schema objects and Alembic version.

Usage (from backend/):
  python scripts/clean_user_data.py --yes
"""

from __future__ import annotations

import argparse

import sqlalchemy as sa
from sqlmodel import Session

from app.db.core import DATABASE_URL, engine

# Delete children first → parents later (respect FKs; avoid relying on cascades)
TABLES_IN_DELETE_ORDER = [
    # Hourly + Daily metrics first
    "video_hourly_metrics",
    "channel_hourly_metrics",
    "video_daily_metrics",
    "channel_daily_metrics",
    # Content & mappings
    "video",
    "user_channel",
    "channel",
    # Auth/Accounts
    "oauth_credential",
    "platform_account",
    # Finally users
    "user",
    # NOTE: we intentionally DO NOT touch the 'platform' table
]


def wipe_all() -> dict[str, int]:
    deleted: dict[str, int] = {}
    with Session(engine) as session:
        for t in TABLES_IN_DELETE_ORDER:
            # Count then delete
            cnt = session.exec(sa.text(f"SELECT COUNT(*) FROM {t}")).one()[0]
            session.exec(sa.text(f"DELETE FROM {t}"))
            deleted[t] = int(cnt or 0)
        session.commit()

    # Optional VACUUM for SQLite file DB to reclaim space
    try:
        if str(DATABASE_URL).startswith("sqlite"):
            with engine.connect() as conn:
                conn.exec_driver_sql("VACUUM")
    except Exception:
        pass

    return deleted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="skip confirmation prompt")
    args = parser.parse_args()

    if not args.yes:
        print("This will DELETE all user data (users, accounts, channels, videos, metrics).")
        print("Schema and Alembic version will be preserved. 'platform' table is not touched.")
        ans = input("Type 'DELETE' to confirm: ").strip()
        if ans != "DELETE":
            print("Aborted.")
            return

    deleted = wipe_all()
    print("Done. Deleted rows:")
    for k, v in deleted.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
