from sqlalchemy import Engine, select

from clipstudio_worker.modules.clips.application import ProxyReadiness
from clipstudio_worker.modules.clips.infrastructure.tables import sources


class SqlAlchemyProxyReadiness(ProxyReadiness):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def proxy_ready(self, source_id: str) -> bool:
        with self._engine.connect() as conn:
            path = conn.execute(
                select(sources.c.proxy_path).where(sources.c.id == source_id)
            ).scalar_one_or_none()
        return bool(path)
