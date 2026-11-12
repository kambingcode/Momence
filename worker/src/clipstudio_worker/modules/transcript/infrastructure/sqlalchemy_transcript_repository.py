import time
import uuid
from collections.abc import Callable
from typing import Any, cast

from sqlalchemy import Engine, select
from sqlalchemy.dialects.sqlite import insert

from clipstudio_worker.modules.transcript.application import (
    Token,
    Transcript,
    TranscriptRepository,
)
from clipstudio_worker.modules.transcript.infrastructure.tables import transcripts


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


def token_to_json(token: Token) -> dict[str, Any]:
    """Bentuk token di kolom `words`; cermin dari web/src/shared/schemas/transcript.ts."""
    return {
        "id": token.id,
        "type": token.type,
        "text": token.text,
        "startMs": token.start_ms,
        "endMs": token.end_ms,
        "confidence": token.confidence,
    }


def token_from_json(data: dict[str, Any]) -> Token:
    """Kebalikan `token_to_json`."""
    token_type = data["type"]
    if token_type not in ("word", "filler", "pause"):
        raise ValueError(f"Tipe token tidak dikenal: {token_type!r}")
    return Token(
        id=data["id"],
        type=token_type,
        text=data["text"],
        start_ms=data["startMs"],
        end_ms=data["endMs"],
        confidence=data.get("confidence"),
    )


class SqlAlchemyTranscriptRepository(TranscriptRepository):
    def __init__(self, engine: Engine, now: Callable[[], int] = _now_ms) -> None:
        self._engine = engine
        self._now = now

    def save(self, transcript: Transcript) -> str:
        stmt = insert(transcripts).values(
            id=str(uuid.uuid4()),
            project_id=transcript.project_id,
            source_id=transcript.source_id,
            language=transcript.language,
            words=[token_to_json(t) for t in transcript.tokens],
            created_at=self._now(),
        )
        # Satu transkrip per sumber: transkripsi ulang menimpa isi, id & created_at tetap.
        stmt = stmt.on_conflict_do_update(
            index_elements=[transcripts.c.source_id],
            set_={"language": stmt.excluded.language, "words": stmt.excluded.words},
        ).returning(transcripts.c.id)
        with self._engine.begin() as conn:
            return conn.execute(stmt).scalar_one()

    def get_by_source(self, source_id: str) -> Transcript | None:
        stmt = select(
            transcripts.c.project_id,
            transcripts.c.language,
            transcripts.c.words,
        ).where(transcripts.c.source_id == source_id)
        with self._engine.connect() as conn:
            row = conn.execute(stmt).first()
        if row is None:
            return None
        words = cast(list[dict[str, Any]], row.words)
        return Transcript(
            project_id=row.project_id,
            source_id=source_id,
            language=row.language,
            tokens=[token_from_json(w) for w in words],
        )
