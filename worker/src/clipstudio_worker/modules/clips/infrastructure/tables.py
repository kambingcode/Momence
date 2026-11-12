"""Cermin tabel milik web (web/src/server/db/schema.ts). Skema & migrasi tetap milik drizzle."""

from sqlalchemy import JSON, Column, Integer, MetaData, String, Table, Text

metadata = MetaData()

# Hanya kolom yang dibaca modul ini (fokus klip yang diisi pengguna saat impor).
projects = Table(
    "projects",
    metadata,
    Column("id", String, primary_key=True),
    Column("clip_focus", Text, nullable=True),
)

# Hanya dibaca: proxy video sumber sudah ada atau belum.
sources = Table(
    "sources",
    metadata,
    Column("id", String, primary_key=True),
    Column("proxy_path", Text, nullable=True),
)

clips = Table(
    "clips",
    metadata,
    Column("id", String, primary_key=True),
    Column("project_id", String, nullable=False),
    Column("title", Text, nullable=False),
    Column("start_ms", Integer, nullable=False),
    Column("end_ms", Integer, nullable=False),
    Column("score", Integer, nullable=True),
    Column("rank", Integer, nullable=True),
    Column("details", JSON(none_as_null=True), nullable=True),
    Column("created_at", Integer, nullable=False),
)

# Hanya dibaca: klip yang punya baris di sini sudah diedit pengguna & dipertahankan discover.
editing_scripts = Table(
    "editing_scripts",
    metadata,
    Column("id", String, primary_key=True),
    Column("clip_id", String, nullable=False),
    Column("version", Integer, nullable=False),
    Column("script", JSON(none_as_null=True), nullable=False),
    Column("updated_at", Integer, nullable=False),
)
