import time
import uuid
from collections.abc import Callable, Mapping, Sequence
from typing import Any, cast

from sqlalchemy import Engine, delete, func, insert, select, update

from clipstudio_worker.modules.clips.application import (
    SUBSCORE_NAMES,
    ClipRepository,
    DiscoveredClip,
    EditedClip,
    KeptClip,
    RankedClip,
    Subscore,
    SubscoreName,
)
from clipstudio_worker.modules.clips.infrastructure.tables import clips as clips_table
from clipstudio_worker.modules.clips.infrastructure.tables import editing_scripts


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


def details_to_json(ranked: RankedClip, source_id: str) -> dict[str, Any]:
    """Isi kolom `clips.details`; cermin dari web/src/shared/schemas/clips.ts."""
    clip = ranked.clip
    return {
        "sourceId": source_id,
        "rawScore": ranked.raw_score,
        "hook": clip.hook,
        "startTokenId": clip.start_token_id,
        "endTokenId": clip.end_token_id,
        "keywords": list(clip.keywords),
        "subscores": {
            name: {"score": s.score, "comment": s.comment} for name, s in clip.subscores.items()
        },
    }


def clip_from_row(row: Any) -> DiscoveredClip:
    """Kebalikan `details_to_json`. Details yang tidak lengkap tidak menggugurkan klip yang
    sudah diedit: subskor yang hilang dianggap tidak ada (raw score 0)."""
    details = cast(Mapping[str, Any], row.details or {})
    raw_subscores = cast(Mapping[str, Any], details.get("subscores") or {})
    subscores: dict[SubscoreName, Subscore] = {}
    for name in SUBSCORE_NAMES:
        value = raw_subscores.get(name)
        if isinstance(value, Mapping):
            entry = cast(Mapping[str, Any], value)
            subscores[name] = Subscore(int(entry.get("score", 0)), str(entry.get("comment", "")))
    raw_keywords = details.get("keywords")
    keywords = (
        tuple(str(k) for k in cast(list[Any], raw_keywords))
        if isinstance(raw_keywords, list)
        else ()
    )
    return DiscoveredClip(
        title=row.title,
        hook=str(details.get("hook", "")),
        start_ms=row.start_ms,
        end_ms=row.end_ms,
        start_token_id=str(details.get("startTokenId", "")),
        end_token_id=str(details.get("endTokenId", "")),
        subscores=subscores,
        keywords=keywords,
    )


def _of_source(source_id: str) -> Any:
    # Tabel clips belum punya kolom source_id; sumbernya dicatat di details.
    return func.json_extract(clips_table.c.details, "$.sourceId") == source_id


class SqlAlchemyClipRepository(ClipRepository):
    def __init__(self, engine: Engine, now: Callable[[], int] = _now_ms) -> None:
        self._engine = engine
        self._now = now

    def edited_for_source(self, project_id: str, source_id: str) -> list[EditedClip]:
        query = (
            select(clips_table)
            .where(
                clips_table.c.project_id == project_id,
                _of_source(source_id),
                clips_table.c.id.in_(select(editing_scripts.c.clip_id)),
            )
            .order_by(clips_table.c.start_ms, clips_table.c.id)
        )
        with self._engine.connect() as conn:
            rows = conn.execute(query).all()
        return [EditedClip(row.id, clip_from_row(row)) for row in rows]

    def replace_for_source(
        self,
        project_id: str,
        source_id: str,
        new: Sequence[RankedClip],
        kept: Sequence[KeptClip],
    ) -> list[str]:
        created_at = self._now()
        ids = [str(uuid.uuid4()) for _ in new]
        rows = [
            {
                "id": clip_id,
                "project_id": project_id,
                "title": ranked.clip.title,
                "start_ms": ranked.clip.start_ms,
                "end_ms": ranked.clip.end_ms,
                "score": ranked.score,
                "rank": ranked.rank,
                "details": details_to_json(ranked, source_id),
                "created_at": created_at,
            }
            for clip_id, ranked in zip(ids, new, strict=True)
        ]
        with self._engine.begin() as conn:
            conn.execute(
                delete(clips_table).where(
                    clips_table.c.project_id == project_id,
                    _of_source(source_id),
                    clips_table.c.id.not_in([k.id for k in kept]),
                )
            )
            for k in kept:
                # Judul & rentang milik pengguna tidak disentuh; hanya skor & peringkat.
                conn.execute(
                    update(clips_table)
                    .where(clips_table.c.id == k.id)
                    .values(
                        score=k.ranked.score,
                        rank=k.ranked.rank,
                        details=details_to_json(k.ranked, source_id),
                    )
                )
            if rows:
                conn.execute(insert(clips_table), rows)
        return ids
