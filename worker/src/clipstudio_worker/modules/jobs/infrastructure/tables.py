"""Cermin tabel milik web (web/src/server/db/schema.ts). Skema & migrasi tetap milik drizzle."""

from sqlalchemy import JSON, Column, Integer, MetaData, String, Table, Text

metadata = MetaData()

jobs = Table(
    "jobs",
    metadata,
    Column("id", String, primary_key=True),
    Column("project_id", String, nullable=True),
    Column("type", String, nullable=False),
    Column("status", String, nullable=False),
    Column("progress", Integer, nullable=False),
    Column("payload", JSON(none_as_null=True), nullable=False),
    Column("result", JSON(none_as_null=True), nullable=True),
    Column("error", Text, nullable=True),
    Column("attempts", Integer, nullable=False),
    Column("created_at", Integer, nullable=False),
    Column("updated_at", Integer, nullable=False),
    Column("started_at", Integer, nullable=True),
    Column("finished_at", Integer, nullable=True),
)
