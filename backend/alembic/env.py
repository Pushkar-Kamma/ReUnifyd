# backend/alembic/env.py
from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

# --- Make 'app' importable (env.py is in backend/alembic/) ---
# This adds the backend/ directory to sys.path so "app" can be imported.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Import models ONLY to load SQLModel.metadata (no engine, no create_all)
from app.db import models  # noqa: F401  (side-effect: registers tables on metadata)

# -------------------------------------------------------------
# Alembic Config object, provides access to .ini values
# -------------------------------------------------------------
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# -------------------------------------------------------------
# Database URL resolution (ENV > alembic.ini > default sqlite)
# -------------------------------------------------------------
db_url = (
    os.getenv("DATABASE_URL")
    or config.get_main_option("sqlalchemy.url")
    or "sqlite:///dev.db"
)

# Ensure Alembic uses the resolved URL (env var wins)
config.set_main_option("sqlalchemy.url", db_url)

# -------------------------------------------------------------
# Target metadata for 'autogenerate'
# -------------------------------------------------------------
# Use the global SQLModel.metadata, not models.SQLModel.metadata
target_metadata = SQLModel.metadata

# Optional: control which objects are included (keep all)
def include_object(object, name, type_, reflected, compare_to):
    return True

# -------------------------------------------------------------
# Offline migrations
# -------------------------------------------------------------
def run_migrations_offline() -> None:
    context.configure(
        url=db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        compare_server_default=True,
        include_object=include_object,
        # Batch mode helps SQLite with ALTER TABLE ops
        render_as_batch=db_url.startswith("sqlite"),
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

# -------------------------------------------------------------
# Online migrations
# -------------------------------------------------------------
def run_migrations_online() -> None:
    # engine_from_config will read sqlalchemy.url from 'config', which we just set
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            include_object=include_object,
            render_as_batch=db_url.startswith("sqlite"),
        )
        with context.begin_transaction():
            context.run_migrations()

# -------------------------------------------------------------
# Entrypoint
# -------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
