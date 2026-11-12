"""Pembuatan engine SQLAlchemy untuk file SQLite yang sama dengan web."""

from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event


def create_sqlite_engine(database_path: Path) -> Engine:
    # timeout = busy_timeout: web & worker menulis ke file yang sama.
    engine = create_engine(f"sqlite:///{database_path}", connect_args={"timeout": 5})

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_connection: Any, _record: Any) -> None:  # pyright: ignore[reportUnusedFunction]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("PRAGMA journal_mode = WAL")
        cursor.close()

    return engine
