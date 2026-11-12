"""Cermin tabel milik web (web/src/server/db/schema.ts). Skema & migrasi tetap milik drizzle."""

from sqlalchemy import JSON, Column, Float, Integer, MetaData, String, Table, Text

metadata = MetaData()

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

clip_reframes = Table(
    "clip_reframes",
    metadata,
    Column("clip_id", String, primary_key=True),
    Column("version", Integer, nullable=False),
    Column("start_ms", Integer, nullable=False),
    Column("end_ms", Integer, nullable=False),
    Column("analysis", JSON(none_as_null=True), nullable=False),
    Column("crop_version", Integer, nullable=True),
    Column("crops", JSON(none_as_null=True), nullable=True),
    Column("updated_at", Integer, nullable=False),
)
