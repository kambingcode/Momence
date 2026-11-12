from collections.abc import Collection

from sqlalchemy import Engine, select

from clipstudio_worker.modules.projects.application import ProjectIndex
from clipstudio_worker.modules.projects.infrastructure.tables import projects


class SqlAlchemyProjectIndex(ProjectIndex):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def project_ids(self) -> Collection[str]:
        with self._engine.connect() as conn:
            return set(conn.execute(select(projects.c.id)).scalars())
