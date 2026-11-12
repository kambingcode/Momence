"""Cermin tabel milik web (web/src/server/db/schema.ts). Skema & migrasi tetap milik drizzle."""

from sqlalchemy import JSON, Column, MetaData, String, Table

metadata = MetaData()

# Hanya kolom yang dibaca pembersihan render.
jobs = Table(
    "jobs",
    metadata,
    Column("id", String, primary_key=True),
    Column("project_id", String, nullable=True),
    Column("type", String, nullable=False),
    Column("status", String, nullable=False),
    Column("result", JSON(none_as_null=True), nullable=True),
)

clips = Table(
    "clips",
    metadata,
    Column("id", String, primary_key=True),
    Column("project_id", String, nullable=False),
)
