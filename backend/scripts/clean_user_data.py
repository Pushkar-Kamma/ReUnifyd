"""
Utility to wipe all user data (users, google accounts, channels, metrics)
from the local dev database. Keeps schema and Alembic version.

Usage (from backend/):
  python scripts/clean_user_data.py --yes
"""

from __future__ import annotations

import argparse
import sqlalchemy as sa
from sqlmodel import Session

from app.db.core import engine, DATABASE_URL


TABLES = [
    "metricdaily",
    "videomap",
    "channel",
    "googleaccount",
    "user",
]


def wipe_all() -> dict[str, int]:
    deleted: dict[str, int] = {}
    with Session(engine) as session:
        for t in TABLES:
            # count
            cnt = session.exec(sa.text(f"SELECT COUNT(*) AS c FROM {t}")).one()[0]
            session.exec(sa.text(f"DELETE FROM {t}"))
            deleted[t] = int(cnt or 0)
        session.commit()

    # Optionally VACUUM for sqlite
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
        print("This will DELETE all user data (users, tokens, channels, metrics).")
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

