"""Cermin tabel milik web (web/src/server/db/schema.ts). Skema & migrasi tetap milik drizzle."""

from sqlalchemy import JSON, Column, Integer, MetaData, String, Table, Text

metadata = MetaData()

transcripts = Table(
    "transcripts",
    metadata,
    Column("id", String, primary_key=True),
    Column("project_id", String, nullable=False),
    Column("source_id", String, nullable=False, unique=True),
    Column("language", Text, nullable=True),
    Column("words", JSON(none_as_null=True), nullable=False),
    Column("created_at", Integer, nullable=False),
)
