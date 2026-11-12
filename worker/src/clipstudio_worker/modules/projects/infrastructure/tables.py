"""Cermin tabel milik web (web/src/server/db/schema.ts). Skema & migrasi tetap milik drizzle."""

from sqlalchemy import JSON, Column, Float, Integer, MetaData, String, Table, Text

metadata = MetaData()

# Hanya kolom yang dipakai worker (bersih-bersih media, nama proyek hasil unduhan).
projects = Table(
    "projects",
    metadata,
    Column("id", String, primary_key=True),
    Column("name", Text, nullable=False),
)

sources = Table(
    "sources",
    metadata,
    Column("id", String, primary_key=True),
    Column("project_id", String, nullable=False),
    Column("original_name", Text, nullable=False),
    Column("path", Text, nullable=False),
    Column("size_bytes", Integer, nullable=False),
    Column("duration_ms", Integer, nullable=True),
    Column("width", Integer, nullable=True),
    Column("height", Integer, nullable=True),
    Column("fps", Float(asdecimal=False), nullable=True),
    Column("audio_path", Text, nullable=True),
    Column("proxy_path", Text, nullable=True),
    Column("created_at", Integer, nullable=False),
)

# Hanya dibaca: klip hasil discover (`details.sourceId` menunjuk video sumbernya).
clips = Table(
    "clips",
    metadata,
    Column("id", String, primary_key=True),
    Column("project_id", String, nullable=False),
    Column("details", JSON(none_as_null=True), nullable=True),
)
