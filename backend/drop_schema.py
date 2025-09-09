# backend/drop_schema.py
import os
from sqlalchemy import create_engine, text
url = os.environ["DATABASE_URL"]
engine = create_engine(url)
with engine.begin() as conn:
    conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
print("Dropped and recreated schema 'public'.")
