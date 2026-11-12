import time
from collections.abc import Callable, Mapping, Sequence
from typing import Any, cast

from sqlalchemy import Engine, exists, select
from sqlalchemy.dialects.sqlite import insert

from clipstudio_worker.modules.reframe.application import (
    ClipAnalysis,
    ClipVideo,
    CropKeyframe,
    FaceBox,
    FaceSample,
    ReframeRepository,
    StoredReframe,
)
from clipstudio_worker.modules.reframe.domain.analysis import FACE_FPS
from clipstudio_worker.modules.reframe.infrastructure.tables import clip_reframes, clips, sources


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


def _fraction(value: float) -> float:
    return round(value, 4)


def analysis_to_json(analysis: ClipAnalysis) -> dict[str, Any]:
    """Isi kolom `clip_reframes.analysis` (hanya dibaca worker; rentang klip ada di kolomnya)."""
    return {
        "width": analysis.width,
        "height": analysis.height,
        "sampleFps": FACE_FPS,
        "samples": [
            {
                "tMs": sample.t_ms,
                "faces": [
                    {
                        "x": _fraction(face.x),
                        "y": _fraction(face.y),
                        "width": _fraction(face.width),
                        "height": _fraction(face.height),
                        "score": _fraction(face.score),
                    }
                    for face in sample.faces
                ],
            }
            for sample in analysis.samples
        ],
        "sceneCutsMs": list(analysis.scene_cuts_ms),
    }


def analysis_from_json(data: Mapping[str, Any], start_ms: int, end_ms: int) -> ClipAnalysis:
    samples = cast(list[dict[str, Any]], data["samples"])
    return ClipAnalysis(
        start_ms=start_ms,
        end_ms=end_ms,
        width=int(data["width"]),
        height=int(data["height"]),
        samples=tuple(
            FaceSample(
                int(sample["tMs"]),
                tuple(
                    FaceBox(
                        float(face["x"]),
                        float(face["y"]),
                        float(face["width"]),
                        float(face["height"]),
                        float(face["score"]),
                    )
                    for face in cast(list[dict[str, Any]], sample["faces"])
                ),
            )
            for sample in samples
        ),
        scene_cuts_ms=tuple(int(t) for t in cast(list[Any], data["sceneCutsMs"])),
    )


def crops_to_json(crops: Mapping[str, Sequence[CropKeyframe]]) -> dict[str, Any]:
    """Isi kolom `clip_reframes.crops`; cermin dari web/src/shared/schemas/reframe.ts."""
    return {
        ratio: [
            {
                "tMs": k.t_ms,
                "cropRect": {
                    "x": k.rect.x,
                    "y": k.rect.y,
                    "width": k.rect.width,
                    "height": k.rect.height,
                },
            }
            for k in keyframes
        ]
        for ratio, keyframes in crops.items()
    }


class SqlAlchemyReframeRepository(ReframeRepository):
    def __init__(self, engine: Engine, now: Callable[[], int] = _now_ms) -> None:
        self._engine = engine
        self._now = now

    def clip_video(self, clip_id: str) -> ClipVideo | None:
        with self._engine.connect() as conn:
            clip = conn.execute(select(clips).where(clips.c.id == clip_id)).first()
            if clip is None:
                return None
            details = cast(Mapping[str, Any], clip.details or {})
            # Klip mencatat video sumbernya di details; data lama → satu-satunya video proyek.
            source_id = details.get("sourceId")
            query = (
                select(sources).where(sources.c.id == source_id)
                if isinstance(source_id, str)
                else select(sources)
                .where(sources.c.project_id == clip.project_id)
                .order_by(sources.c.created_at)
            )
            source = conn.execute(query).first()
        if source is None:
            return None
        return ClipVideo(
            clip_id=clip.id,
            start_ms=clip.start_ms,
            end_ms=clip.end_ms,
            video_path=source.proxy_path or source.path,
            width=source.width,
            height=source.height,
        )

    def stored(self, clip_id: str) -> StoredReframe | None:
        query = select(clip_reframes).where(clip_reframes.c.clip_id == clip_id)
        with self._engine.connect() as conn:
            row = conn.execute(query).first()
        if row is None:
            return None
        return StoredReframe(
            version=row.version,
            analysis=analysis_from_json(
                cast(Mapping[str, Any], row.analysis), row.start_ms, row.end_ms
            ),
            crop_version=row.crop_version if row.crops is not None else None,
        )

    def save(
        self,
        clip_id: str,
        version: int,
        analysis: ClipAnalysis,
        crop_version: int,
        crops: Mapping[str, Sequence[CropKeyframe]],
    ) -> bool:
        values = {
            "version": version,
            "start_ms": analysis.start_ms,
            "end_ms": analysis.end_ms,
            "analysis": analysis_to_json(analysis),
            "crop_version": crop_version,
            "crops": crops_to_json(crops),
            "updated_at": self._now(),
        }
        upsert = (
            insert(clip_reframes)
            .values(clip_id=clip_id, **values)
            .on_conflict_do_update(index_elements=[clip_reframes.c.clip_id], set_=values)
        )
        with self._engine.begin() as conn:
            # Klip bisa dihapus (discover ulang) selama analisis berjalan.
            if not conn.execute(select(exists().where(clips.c.id == clip_id))).scalar():
                return False
            conn.execute(upsert)
        return True
