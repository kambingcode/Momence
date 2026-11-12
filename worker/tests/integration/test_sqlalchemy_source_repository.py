from sqlalchemy import Engine, inspect, select, text

from clipstudio_worker.modules.projects.infrastructure.sqlalchemy_source_repository import (
    SqlAlchemySourceRepository,
)
from clipstudio_worker.modules.projects.infrastructure.tables import clips, projects, sources


def seed(engine: Engine) -> None:
    with engine.begin() as conn:
        for project_id in ("p1", "p2"):
            conn.execute(
                text("INSERT INTO projects (id, name) VALUES (:id, 'YouTube abc')"),
                {"id": project_id},
            )
            conn.execute(
                text(
                    "INSERT INTO sources (id, project_id, original_name, path, size_bytes) "
                    "VALUES (:id, :project, 'https://www.youtube.com/watch?v=abc', "
                    "'media/' || :project || '/source.mp4', 0)"
                ),
                {"id": f"s-{project_id}", "project": project_id},
            )


def test_projects_mirror_columns_exist_in_web_schema(engine: Engine) -> None:
    db_columns = {c["name"] for c in inspect(engine).get_columns("projects")}
    assert {c.name for c in projects.columns} <= db_columns


def test_save_download_updates_size_and_project_name_only_for_that_source(engine: Engine) -> None:
    seed(engine)

    SqlAlchemySourceRepository(engine).save_download("s-p1", 4321, "Judul video")

    with engine.connect() as conn:
        names = dict(conn.execute(select(projects.c.id, projects.c.name)).tuples().all())
        sizes = dict(conn.execute(select(sources.c.id, sources.c.size_bytes)).tuples().all())
    assert names == {"p1": "Judul video", "p2": "YouTube abc"}
    assert sizes == {"s-p1": 4321, "s-p2": 0}


def test_list_ingested_returns_only_sources_with_proxy_and_duration(engine: Engine) -> None:
    seed(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE sources SET proxy_path = 'media/p1/proxy.mp4', duration_ms = 5000 "
                "WHERE id = 's-p1'"
            )
        )

    [record] = SqlAlchemySourceRepository(engine).list_ingested()

    assert (record.id, record.project_id) == ("s-p1", "p1")
    assert (record.proxy_path, record.duration_ms) == ("media/p1/proxy.mp4", 5000)


def test_clips_mirror_columns_exist_in_web_schema(engine: Engine) -> None:
    db_columns = {c["name"] for c in inspect(engine).get_columns("clips")}
    assert {c.name for c in clips.columns} <= db_columns


def test_save_audio_sets_duration_and_audio_path_and_optionally_the_project_name(
    engine: Engine,
) -> None:
    seed(engine)
    repository = SqlAlchemySourceRepository(engine)

    repository.save_audio("s-p1", 9_697_152, "media/p1/audio.wav", None)
    repository.save_audio("s-p2", 5_000, "media/p2/audio.wav", "Judul stream")

    record = repository.get("s-p1")
    assert record is not None
    assert (record.audio_path, record.duration_ms, record.proxy_path) == (
        "media/p1/audio.wav",
        9_697_152,
        None,
    )
    with engine.connect() as conn:
        names = dict(conn.execute(select(projects.c.id, projects.c.name)).tuples().all())
        sizes = dict(conn.execute(select(sources.c.id, sources.c.size_bytes)).tuples().all())
    # Tanpa nama → nama proyek tidak disentuh; ukuran file video bukan urusan audio.
    assert names == {"p1": "YouTube abc", "p2": "Judul stream"}
    assert sizes == {"s-p1": 0, "s-p2": 0}
    # Audio saja belum membuat sumber dianggap "ter-ingest".
    assert repository.list_ingested() == []


def test_clip_ids_returns_only_clips_discovered_for_that_source(engine: Engine) -> None:
    seed(engine)
    with engine.begin() as conn:
        for clip_id, source_id in (("c1", "s-p1"), ("c2", "s-p1"), ("c3", "s-p2")):
            conn.execute(
                text(
                    "INSERT INTO clips (id, project_id, title, start_ms, end_ms, details) "
                    "VALUES (:id, 'p1', 'Klip', 0, 30000, json_object('sourceId', :source))"
                ),
                {"id": clip_id, "source": source_id},
            )

    repository = SqlAlchemySourceRepository(engine)

    assert repository.clip_ids("s-p1") == ["c1", "c2"]
    assert repository.clip_ids("s-p2") == ["c3"]
    assert repository.clip_ids("tidak-ada") == []
