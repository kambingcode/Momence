from sqlalchemy import Engine, inspect, text

from clipstudio_worker.modules.clips.infrastructure.sqlalchemy_clip_focus import (
    SqlAlchemyClipFocus,
)
from clipstudio_worker.modules.clips.infrastructure.tables import projects


def add_project(engine: Engine, project_id: str, focus: str | None) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO projects (id, name, clip_focus) VALUES (:id, 'Uji', :focus)"),
            {"id": project_id, "focus": focus},
        )


def test_mirror_columns_exist_in_web_schema(engine: Engine) -> None:
    db_columns = {c["name"] for c in inspect(engine).get_columns("projects")}
    assert {c.name for c in projects.columns} <= db_columns


def test_reads_focus_of_the_project(engine: Engine) -> None:
    add_project(engine, "p1", "momen lucu dan reaksi")
    add_project(engine, "p2", None)
    add_project(engine, "p3", "   ")
    reader = SqlAlchemyClipFocus(engine)

    assert reader.clip_focus("p1") == "momen lucu dan reaksi"
    assert reader.clip_focus("p2") is None
    assert reader.clip_focus("p3") is None
    assert reader.clip_focus("tidak-ada") is None
