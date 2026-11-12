from pathlib import Path

from sqlalchemy import Engine, inspect, text

from clipstudio_worker.modules.render.application import FinishedRender
from clipstudio_worker.modules.render.infrastructure.local_render_files import LocalRenderFiles
from clipstudio_worker.modules.render.infrastructure.sqlalchemy_render_history import (
    SqlAlchemyRenderHistory,
)
from clipstudio_worker.modules.render.infrastructure.tables import clips, jobs


def test_mirror_tables_exist_in_web_schema(engine: Engine) -> None:
    for table in (jobs, clips):
        db_columns = {c["name"] for c in inspect(engine).get_columns(table.name)}
        assert {c.name for c in table.columns} <= db_columns


def test_reads_finished_renders_and_clips_of_project(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO projects (id, name) VALUES ('p1', 'a'), ('p2', 'b')"))
        conn.execute(
            text(
                "INSERT INTO clips (id, project_id, title, start_ms, end_ms) VALUES "
                "('c1', 'p1', 'k', 0, 1), ('c2', 'p2', 'k', 0, 1)"
            )
        )
        rows = [
            (
                "j1",
                "p1",
                "render",
                "done",
                '{"clipId":"c1","outputPath":"media/p1/renders/j1.mp4"}',
            ),
            ("j2", "p1", "render", "failed", None),
            ("j3", "p1", "render", "running", None),
            ("j4", "p1", "ingest", "done", '{"clipId":"c1","outputPath":"x"}'),
            (
                "j5",
                "p2",
                "render",
                "done",
                '{"clipId":"c2","outputPath":"media/p2/renders/j5.mp4"}',
            ),
            ("j6", "p1", "render", "done", '{"clipId":1}'),
        ]
        for job_id, project_id, job_type, status, result in rows:
            conn.execute(
                text(
                    "INSERT INTO jobs (id, project_id, type, status, payload, result) "
                    "VALUES (:id, :p, :t, :s, '{}', :r)"
                ),
                {"id": job_id, "p": project_id, "t": job_type, "s": status, "r": result},
            )
    history = SqlAlchemyRenderHistory(engine)
    assert history.finished_renders("p1") == [FinishedRender("j1", "c1", "media/p1/renders/j1.mp4")]
    assert history.clip_ids("p1") == {"c1"}


def test_remove_deletes_file_and_ignores_missing_or_outside_paths(tmp_path: Path) -> None:
    renders = tmp_path / "media" / "p1" / "renders"
    renders.mkdir(parents=True)
    (renders / "j1.mp4").write_bytes(b"x")
    outside = tmp_path.parent / "luar.mp4"
    outside.write_bytes(b"x")
    files = LocalRenderFiles(tmp_path)

    files.remove("media/p1/renders/j1.mp4")
    files.remove("media/p1/renders/j1.mp4")  # sudah tidak ada → diam saja
    files.remove("../luar.mp4")  # di luar direktori data → hanya dicatat

    assert not (renders / "j1.mp4").exists()
    assert outside.exists()
    outside.unlink()
