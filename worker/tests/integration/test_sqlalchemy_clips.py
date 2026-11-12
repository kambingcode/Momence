from sqlalchemy import Engine, inspect, select, text

from clipstudio_worker.modules.clips.application import (
    DiscoveredClip,
    KeptClip,
    RankedClip,
    Subscore,
)
from clipstudio_worker.modules.clips.infrastructure.sqlalchemy_clip_repository import (
    SqlAlchemyClipRepository,
)
from clipstudio_worker.modules.clips.infrastructure.tables import clips, editing_scripts


def seed_project(engine: Engine, project_id: str = "p1", *source_ids: str) -> None:
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO projects (id, name) VALUES (:p, 'Uji')"), {"p": project_id})
    for source_id in source_ids or ("s1",):
        seed_source(engine, project_id, source_id)


def seed_source(engine: Engine, project_id: str, source_id: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO sources (id, project_id, original_name, path, size_bytes) "
                "VALUES (:s, :p, 'a.mp4', 'media/source.mp4', 1)"
            ),
            {"s": source_id, "p": project_id},
        )


def test_mirror_tables_match_web_schema(engine: Engine) -> None:
    for table in (clips, editing_scripts):
        db_columns = {c["name"] for c in inspect(engine).get_columns(table.name)}
        assert {c.name for c in table.columns} == db_columns


def clip(start_ms: int, title: str = "Judul", score: int = 90, rank: int = 1) -> RankedClip:
    found = DiscoveredClip(
        title=title,
        hook="Hook",
        start_ms=start_ms,
        end_ms=start_ms + 30_000,
        start_token_id="w1",
        end_token_id="w9",
        subscores={
            "hook": Subscore(8, "a"),
            "flow": Subscore(7, "b"),
            "value": Subscore(6, "c"),
            "trend": Subscore(5, "d"),
        },
        keywords=("nabung", "darurat"),
    )
    return RankedClip(found, raw_score=6.5, score=score, rank=rank)


def test_replace_for_source_swaps_only_clips_of_that_source(engine: Engine) -> None:
    seed_project(engine, "p1", "s1", "s1b")
    seed_project(engine, "p2", "s2")
    repo = SqlAlchemyClipRepository(engine, now=lambda: 1_000)
    repo.replace_for_source("p2", "s2", [clip(0, "Milik p2")], [])
    repo.replace_for_source("p1", "s1b", [clip(0, "Sumber lain p1")], [])
    repo.replace_for_source("p1", "s1", [clip(0, "Lama")], [])

    ids = repo.replace_for_source(
        "p1", "s1", [clip(10_000, "Baru 1", 99, 1), clip(50_000, "Baru 2", 60, 2)], []
    )

    with engine.connect() as conn:
        rows = conn.execute(select(clips).order_by(clips.c.project_id, clips.c.start_ms)).all()
    assert [(r.id, r.project_id, r.title, r.score, r.rank) for r in rows] == [
        (rows[0].id, "p1", "Sumber lain p1", 90, 1),
        (ids[0], "p1", "Baru 1", 99, 1),
        (ids[1], "p1", "Baru 2", 60, 2),
        (rows[3].id, "p2", "Milik p2", 90, 1),
    ]
    first = rows[1]
    assert (first.start_ms, first.end_ms, first.created_at) == (10_000, 40_000, 1_000)
    assert first.details == {
        "sourceId": "s1",
        "rawScore": 6.5,
        "hook": "Hook",
        "startTokenId": "w1",
        "endTokenId": "w9",
        "keywords": ["nabung", "darurat"],
        "subscores": {
            "hook": {"score": 8, "comment": "a"},
            "flow": {"score": 7, "comment": "b"},
            "value": {"score": 6, "comment": "c"},
            "trend": {"score": 5, "comment": "d"},
        },
    }


def test_replace_with_empty_list_clears_project(engine: Engine) -> None:
    seed_project(engine)
    repo = SqlAlchemyClipRepository(engine)
    repo.replace_for_source("p1", "s1", [clip(0)], [])
    assert repo.replace_for_source("p1", "s1", [], []) == []
    with engine.connect() as conn:
        assert conn.execute(select(clips)).all() == []


def mark_edited(engine: Engine, clip_id: str) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO editing_scripts (id, clip_id, script) VALUES (:id, :clip, '{}')"),
            {"id": f"e-{clip_id}", "clip": clip_id},
        )


def test_edited_clips_survive_replace_and_only_scores_change(engine: Engine) -> None:
    seed_project(engine, "p1", "s1", "s2")
    repo = SqlAlchemyClipRepository(engine)
    [edited_id, plain_id] = repo.replace_for_source(
        "p1", "s1", [clip(0, "Diedit", 99, 1), clip(60_000, "Biasa", 60, 2)], []
    )
    [other_source_id] = repo.replace_for_source("p1", "s2", [clip(0, "Sumber lain")], [])
    mark_edited(engine, edited_id)
    mark_edited(engine, other_source_id)

    [edited] = repo.edited_for_source("p1", "s1")
    assert edited.id == edited_id
    # Kata kunci ikut dibaca kembali, sehingga tidak hilang saat klip diperingkat ulang.
    assert edited.clip == clip(0, "Diedit").clip

    kept = KeptClip(edited_id, RankedClip(edited.clip, raw_score=6.5, score=70, rank=2))
    [new_id] = repo.replace_for_source("p1", "s1", [clip(90_000, "Baru", 99, 1)], [kept])

    with engine.connect() as conn:
        rows = conn.execute(
            select(clips).where(clips.c.project_id == "p1").order_by(clips.c.title)
        ).all()
        scripts = conn.execute(select(editing_scripts.c.clip_id)).scalars().all()
    assert [(r.id, r.title, r.start_ms, r.score, r.rank) for r in rows] == [
        (new_id, "Baru", 90_000, 99, 1),
        (edited_id, "Diedit", 0, 70, 2),
        (other_source_id, "Sumber lain", 0, 90, 1),
    ]
    assert plain_id not in [r.id for r in rows]
    # EditingScript klip yang dipertahankan tidak ikut terhapus.
    assert sorted(scripts) == sorted([edited_id, other_source_id])
