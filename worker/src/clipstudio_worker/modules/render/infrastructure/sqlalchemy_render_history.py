from collections.abc import Collection, Sequence
from typing import Any, cast

from sqlalchemy import Engine, select

from clipstudio_worker.modules.render.application import FinishedRender, RenderHistory
from clipstudio_worker.modules.render.infrastructure.tables import clips, jobs


class SqlAlchemyRenderHistory(RenderHistory):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def finished_renders(self, project_id: str) -> Sequence[FinishedRender]:
        stmt = select(jobs.c.id, jobs.c.result).where(
            jobs.c.project_id == project_id, jobs.c.type == "render", jobs.c.status == "done"
        )
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        renders: list[FinishedRender] = []
        for job_id, result in rows:
            # Bentuk = renderResultSchema; hasil lain dilewati, bukan dianggap galat.
            if not isinstance(result, dict):
                continue
            data = cast(dict[str, Any], result)
            clip_id, output_path = data.get("clipId"), data.get("outputPath")
            if isinstance(clip_id, str) and isinstance(output_path, str):
                renders.append(FinishedRender(job_id, clip_id, output_path))
        return renders

    def clip_ids(self, project_id: str) -> Collection[str]:
        stmt = select(clips.c.id).where(clips.c.project_id == project_id)
        with self._engine.connect() as conn:
            return set(conn.execute(stmt).scalars())
