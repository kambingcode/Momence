from collections.abc import Sequence
from typing import Any

from sqlalchemy import Engine, func, select, update

from clipstudio_worker.modules.projects.application import (
    IngestedSources,
    MediaInfo,
    SourceClips,
    SourceRecord,
    SourceRepository,
)
from clipstudio_worker.modules.projects.infrastructure.tables import clips, projects, sources

_RECORD_COLUMNS = (
    sources.c.id,
    sources.c.project_id,
    sources.c.path,
    sources.c.audio_path,
    sources.c.proxy_path,
    sources.c.duration_ms,
)


def _record(row: Any) -> SourceRecord:
    return SourceRecord(
        id=row.id,
        project_id=row.project_id,
        path=row.path,
        audio_path=row.audio_path,
        proxy_path=row.proxy_path,
        duration_ms=row.duration_ms,
    )


class SqlAlchemySourceRepository(SourceRepository, IngestedSources, SourceClips):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def get(self, source_id: str) -> SourceRecord | None:
        stmt = select(*_RECORD_COLUMNS).where(sources.c.id == source_id)
        with self._engine.connect() as conn:
            row = conn.execute(stmt).first()
        return None if row is None else _record(row)

    def list_ingested(self) -> Sequence[SourceRecord]:
        stmt = (
            select(*_RECORD_COLUMNS)
            .where(sources.c.proxy_path.is_not(None), sources.c.duration_ms.is_not(None))
            .order_by(sources.c.created_at)
        )
        with self._engine.connect() as conn:
            return [_record(row) for row in conn.execute(stmt)]

    def clip_ids(self, source_id: str) -> list[str]:
        stmt = (
            select(clips.c.id)
            .where(func.json_extract(clips.c.details, "$.sourceId") == source_id)
            .order_by(clips.c.id)
        )
        with self._engine.connect() as conn:
            return [row.id for row in conn.execute(stmt)]

    def save_audio(
        self, source_id: str, duration_ms: int, audio_path: str, project_name: str | None
    ) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                update(sources)
                .where(sources.c.id == source_id)
                .values(duration_ms=duration_ms, audio_path=audio_path)
            )
            if project_name is not None:
                project_id = select(sources.c.project_id).where(sources.c.id == source_id)
                conn.execute(
                    update(projects)
                    .where(projects.c.id == project_id.scalar_subquery())
                    .values(name=project_name)
                )

    def save_media(self, source_id: str, info: MediaInfo, audio_path: str, proxy_path: str) -> None:
        stmt = (
            update(sources)
            .where(sources.c.id == source_id)
            .values(
                duration_ms=info.duration_ms,
                width=info.width,
                height=info.height,
                fps=info.fps,
                audio_path=audio_path,
                proxy_path=proxy_path,
            )
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def save_download(self, source_id: str, size_bytes: int, project_name: str) -> None:
        project_id = select(sources.c.project_id).where(sources.c.id == source_id)
        with self._engine.begin() as conn:
            conn.execute(
                update(sources).where(sources.c.id == source_id).values(size_bytes=size_bytes)
            )
            conn.execute(
                update(projects)
                .where(projects.c.id == project_id.scalar_subquery())
                .values(name=project_name)
            )
