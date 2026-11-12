"""Cermin tabel milik web (web/src/server/db/schema.ts). Skema & migrasi tetap milik drizzle."""

from sqlalchemy import JSON, Column, Integer, MetaData, String, Table

metadata = MetaData()

settings = Table(
    "settings",
    metadata,
    Column("key", String, primary_key=True),
    Column("value", JSON(none_as_null=True), nullable=False),
    Column("updated_at", Integer, nullable=False),
)
