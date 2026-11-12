from sqlalchemy import Engine, inspect, select, text

from clipstudio_worker.modules.reframe.application import (
    ClipAnalysis,
    ClipVideo,
    CropKeyframe,
    CropRect,
    FaceBox,
    FaceSample,
)
from clipstudio_worker.modules.reframe.infrastructure.sqlalchemy_reframe_repository import (
    SqlAlchemyReframeRepository,
)
from clipstudio_worker.modules.reframe.infrastructure.tables import clip_reframes, clips, sources


def seed(engine: Engine, *, proxy: bool = True, source_in_details: bool = True) -> None:
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO projects (id, name) VALUES ('p1', 'Uji')"))
        conn.execute(
            text(
                "INSERT INTO sources (id, project_id, original_name, path, size_bytes, width, "
                "height, proxy_path) VALUES ('s1', 'p1', 'a.mov', 'media/p1/source.mov', 1, "
                "1920, 1080, :proxy)"
            ),
            {"proxy": "media/p1/proxy.mp4" if proxy else None},
        )
        conn.execute(
            text(
                "INSERT INTO clips (id, project_id, title, start_ms, end_ms, details) "
                "VALUES ('c1', 'p1', 'Klip', 10000, 40000, :details)"
            ),
            {"details": '{"sourceId": "s1"}' if source_in_details else None},
        )


ANALYSIS = ClipAnalysis(
    start_ms=10_000,
    end_ms=40_000,
    width=1920,
    height=1080,
    samples=(
        FaceSample(10_000, (FaceBox(0.123456, 0.2, 0.1, 0.15, 0.912345),)),
        FaceSample(10_200, ()),
    ),
    scene_cuts_ms=(25_000,),
)
CROPS = {
    "9:16": [CropKeyframe(10_000, CropRect(0.3418, 0.0, 0.3164, 1.0))],
    "1:1": [],
    "16:9": [],
}


def test_mirror_tables_match_web_schema(engine: Engine) -> None:
    for table in (clips, sources, clip_reframes):
        db_columns = {c["name"] for c in inspect(engine).get_columns(table.name)}
        assert {c.name for c in table.columns} == db_columns


def test_clip_video_prefers_proxy(engine: Engine) -> None:
    seed(engine)
    repository = SqlAlchemyReframeRepository(engine)

    assert repository.clip_video("c1") == ClipVideo(
        "c1", 10_000, 40_000, "media/p1/proxy.mp4", 1920, 1080
    )
    assert repository.clip_video("hilang") is None


def test_clip_video_falls_back_to_source_and_project_source(engine: Engine) -> None:
    seed(engine, proxy=False, source_in_details=False)

    video = SqlAlchemyReframeRepository(engine).clip_video("c1")

    assert video is not None and video.video_path == "media/p1/source.mov"


def test_save_upserts_json_and_stored_round_trips(engine: Engine) -> None:
    seed(engine)
    repository = SqlAlchemyReframeRepository(engine, now=lambda: 1234)

    assert repository.stored("c1") is None
    assert repository.save("c1", 1, ANALYSIS, 3, CROPS)

    with engine.connect() as conn:
        row = conn.execute(select(clip_reframes)).one()
    assert (
        row.clip_id,
        row.version,
        row.start_ms,
        row.end_ms,
        row.crop_version,
        row.updated_at,
    ) == ("c1", 1, 10_000, 40_000, 3, 1234)
    assert row.analysis == {
        "width": 1920,
        "height": 1080,
        "sampleFps": 5,
        "samples": [
            {
                "tMs": 10_000,
                "faces": [{"x": 0.1235, "y": 0.2, "width": 0.1, "height": 0.15, "score": 0.9123}],
            },
            {"tMs": 10_200, "faces": []},
        ],
        "sceneCutsMs": [25_000],
    }
    # Bentuk = cropTracksSchema di web.
    assert row.crops == {
        "9:16": [
            {"tMs": 10_000, "cropRect": {"x": 0.3418, "y": 0.0, "width": 0.3164, "height": 1.0}}
        ],
        "1:1": [],
        "16:9": [],
    }

    stored = repository.stored("c1")
    assert stored is not None
    assert (stored.version, stored.crop_version) == (1, 3)
    # Pembulatan 4 desimal; selain itu analisis kembali utuh.
    assert stored.analysis.samples[0].faces[0] == FaceBox(0.1235, 0.2, 0.1, 0.15, 0.9123)
    assert stored.analysis.samples[1:] == ANALYSIS.samples[1:]
    assert (stored.analysis.start_ms, stored.analysis.end_ms, stored.analysis.scene_cuts_ms) == (
        10_000,
        40_000,
        (25_000,),
    )

    assert repository.save("c1", 2, ANALYSIS, 4, CROPS)
    stored = repository.stored("c1")
    assert stored is not None and (stored.version, stored.crop_version) == (2, 4)


def test_row_without_crops_reports_no_crop_version(engine: Engine) -> None:
    """Baris dari T7.1 (sebelum kolom crop) → crop dihitung ulang."""
    seed(engine)
    repository = SqlAlchemyReframeRepository(engine)
    repository.save("c1", 1, ANALYSIS, 1, CROPS)
    with engine.begin() as conn:
        conn.execute(text("UPDATE clip_reframes SET crops = NULL, crop_version = NULL"))

    stored = repository.stored("c1")
    assert stored is not None and stored.crop_version is None


def test_save_for_deleted_clip_returns_false_and_delete_cascades(engine: Engine) -> None:
    seed(engine)
    repository = SqlAlchemyReframeRepository(engine)
    assert repository.save("c1", 1, ANALYSIS, 1, CROPS)

    with engine.begin() as conn:
        conn.execute(text("DELETE FROM clips WHERE id = 'c1'"))
        assert conn.execute(select(clip_reframes)).all() == []

    assert not repository.save("c1", 1, ANALYSIS, 1, CROPS)
