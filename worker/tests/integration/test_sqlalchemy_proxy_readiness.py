from sqlalchemy import Engine, inspect, text

from clipstudio_worker.modules.clips.infrastructure.sqlalchemy_proxy_readiness import (
    SqlAlchemyProxyReadiness,
)
from clipstudio_worker.modules.clips.infrastructure.tables import sources


def test_sources_mirror_columns_exist_in_web_schema(engine: Engine) -> None:
    db_columns = {c["name"] for c in inspect(engine).get_columns("sources")}
    assert {c.name for c in sources.columns} <= db_columns


def test_proxy_ready_only_after_proxy_path_is_saved(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO projects (id, name) VALUES ('p1', 'Stream')"))
        conn.execute(
            text(
                "INSERT INTO sources (id, project_id, original_name, path, size_bytes) "
                "VALUES ('s1', 'p1', 'x', 'media/p1/source.mp4', 0)"
            )
        )
    readiness = SqlAlchemyProxyReadiness(engine)

    assert readiness.proxy_ready("s1") is False
    assert readiness.proxy_ready("tidak-ada") is False

    with engine.begin() as conn:
        conn.execute(text("UPDATE sources SET proxy_path = 'media/p1/proxy.mp4' WHERE id = 's1'"))

    assert readiness.proxy_ready("s1") is True
