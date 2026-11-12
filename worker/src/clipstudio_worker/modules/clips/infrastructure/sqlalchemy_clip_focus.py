from sqlalchemy import Engine, select

from clipstudio_worker.modules.clips.application import ClipFocusReader
from clipstudio_worker.modules.clips.infrastructure.tables import projects


class SqlAlchemyClipFocus(ClipFocusReader):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def clip_focus(self, project_id: str) -> str | None:
        with self._engine.connect() as conn:
            value = conn.execute(
                select(projects.c.clip_focus).where(projects.c.id == project_id)
            ).scalar_one_or_none()
        # Hanya spasi = tanpa fokus (web sudah merapikan, ini pengaman untuk data tulisan tangan).
        return value.strip() or None if value else None
