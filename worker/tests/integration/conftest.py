"""DB uji dibuat dari migrasi drizzle milik web, sehingga cermin tabel worker ikut teruji."""

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine

from clipstudio_worker.db import create_sqlite_engine

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "web" / "drizzle"


def apply_web_migrations(database_path: Path) -> None:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    assert files, f"Migrasi drizzle tidak ditemukan di {MIGRATIONS_DIR}"
    with sqlite3.connect(database_path) as conn:
        for file in files:
            for statement in file.read_text().split("--> statement-breakpoint"):
                if statement.strip():
                    conn.execute(statement)


@pytest.fixture
def engine(tmp_path: Path) -> Iterator[Engine]:
    database_path = tmp_path / "test.db"
    apply_web_migrations(database_path)
    engine = create_sqlite_engine(database_path)
    yield engine
    engine.dispose()
