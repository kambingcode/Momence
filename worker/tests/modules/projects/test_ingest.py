from collections.abc import Callable

import pytest

from clipstudio_worker.modules.jobs.application import Job, JobFailure
from clipstudio_worker.modules.projects.application import (
    IngestJob,
    MediaInfo,
    MediaProcessor,
    SourceClips,
    SourceRecord,
    SourceRepository,
    ThumbnailError,
    ThumbnailMaker,
)
from tests.modules.jobs.fakes import InMemoryJobRepository


class FakeSources(SourceRepository):
    def __init__(self, audio_path: str | None = None) -> None:
        self.records = {
            "s1": SourceRecord(
                id="s1", project_id="p1", path="media/p1/source.mov", audio_path=audio_path
            )
        }
        self.saved: dict[str, tuple[MediaInfo, str, str]] = {}
        self.audio: dict[str, tuple[int, str, str | None]] = {}
        # Urutan penyimpanan terhadap antrean job (transkripsi harus diantre sebelum proxy jadi).
        self.events: list[str] = []

    def save_audio(
        self, source_id: str, duration_ms: int, audio_path: str, project_name: str | None
    ) -> None:
        self.audio[source_id] = (duration_ms, audio_path, project_name)
        self.events.append("save_audio")

    def get(self, source_id: str) -> SourceRecord | None:
        return self.records.get(source_id)

    def save_media(self, source_id: str, info: MediaInfo, audio_path: str, proxy_path: str) -> None:
        self.saved[source_id] = (info, audio_path, proxy_path)
        self.events.append("save_media")

    def save_download(self, source_id: str, size_bytes: int, project_name: str) -> None:
        raise AssertionError("ingest tidak mengunduh")


class FakeMedia(MediaProcessor):
    def __init__(self, info: MediaInfo) -> None:
        self.info = info
        self.calls: list[tuple[str, ...]] = []

    def probe(self, path: str) -> MediaInfo:
        self.calls.append(("probe", path))
        return self.info

    def audio_duration_ms(self, path: str) -> int:
        raise AssertionError("ingest tidak mengukur audio terpisah")

    def extract_audio(
        self, source: str, target: str, duration_ms: int, on_progress: Callable[[float], None]
    ) -> None:
        self.calls.append(("audio", source, target))
        on_progress(0.5)
        on_progress(1.0)

    def make_proxy(
        self,
        source: str,
        target: str,
        size: tuple[int, int],
        frame_rate: float | None,
        duration_ms: int,
        on_progress: Callable[[float], None],
    ) -> None:
        self.calls.append(("proxy", source, target, f"{size[0]}x{size[1]}@{frame_rate}"))
        on_progress(1.0)


class FakeSourceClips(SourceClips):
    def __init__(self, *clip_ids: str) -> None:
        self.ids = list(clip_ids)

    def clip_ids(self, source_id: str) -> list[str]:
        return self.ids


class FakeThumbnails(ThumbnailMaker):
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.calls: list[tuple[str, str, int, int]] = []

    def make(self, source: str, target: str, at_ms: int, width: int) -> None:
        self.calls.append((source, target, at_ms, width))
        if self.fail:
            raise ThumbnailError("ffmpeg mogok")


INFO = MediaInfo(duration_ms=60_000, width=1080, height=1920, fps=29.97, has_audio=True)


def job(payload: object) -> Job:
    return Job(
        id="j1",
        project_id="p1",
        type="ingest",
        status="running",
        progress=0,
        payload=payload,
        attempts=1,
    )


def test_ingest_extracts_media_saves_metadata_and_queues_transcribe() -> None:
    sources, media, jobs = FakeSources(), FakeMedia(INFO), InMemoryJobRepository()
    thumbnails = FakeThumbnails()
    progress: list[float] = []

    result = IngestJob(sources, media, thumbnails, jobs)(job({"sourceId": "s1"}), progress.append)

    assert media.calls == [
        ("probe", "media/p1/source.mov"),
        ("audio", "media/p1/source.mov", "media/p1/audio.wav"),
        ("proxy", "media/p1/source.mov", "media/p1/proxy.mp4", "720x1280@None"),
    ]
    # Dari proxy, ±10% durasi (60 dtk → 6 dtk), lebar 320 px.
    assert thumbnails.calls == [("media/p1/proxy.mp4", "media/p1/thumb.jpg", 6000, 320)]
    assert result["thumbnailPath"] == "media/p1/thumb.jpg"
    assert sources.saved["s1"] == (INFO, "media/p1/audio.wav", "media/p1/proxy.mp4")
    [queued] = jobs.jobs.values()
    assert (queued.type, queued.project_id, queued.payload) == (
        "transcribe",
        "p1",
        {"sourceId": "s1"},
    )
    assert result["transcribeJobId"] == queued.id
    assert progress == sorted(progress)
    assert progress[-1] == 95


def test_ingest_makes_30fps_proxy_for_60fps_source() -> None:
    info = MediaInfo(duration_ms=60_000, width=1920, height=1080, fps=60.0, has_audio=True)
    media = FakeMedia(info)

    result = IngestJob(FakeSources(), media, FakeThumbnails(), InMemoryJobRepository())(
        job({"sourceId": "s1"}), lambda _: None
    )

    assert media.calls[-1] == (
        "proxy",
        "media/p1/source.mov",
        "media/p1/proxy.mp4",
        "1280x720@30.0",
    )
    # Metadata sumber tetap fps asli (render memakai sumber); fps proxy hanya di hasil job.
    assert (result["fps"], result["proxyFps"]) == (60.0, 30.0)


def test_ingest_rejects_video_without_audio() -> None:
    media = FakeMedia(MediaInfo(duration_ms=1000, width=10, height=10, fps=None, has_audio=False))
    jobs = InMemoryJobRepository()
    with pytest.raises(JobFailure, match="trek audio"):
        IngestJob(FakeSources(), media, FakeThumbnails(), jobs)(
            job({"sourceId": "s1"}), lambda _: None
        )
    assert jobs.jobs == {}


def test_ingest_fails_for_unknown_source() -> None:
    with pytest.raises(JobFailure, match="tidak ditemukan"):
        IngestJob(FakeSources(), FakeMedia(INFO), FakeThumbnails(), InMemoryJobRepository())(
            job({"sourceId": "hilang"}), lambda _: None
        )


def test_ingest_still_succeeds_when_thumbnail_fails() -> None:
    sources, jobs = FakeSources(), InMemoryJobRepository()

    result = IngestJob(sources, FakeMedia(INFO), FakeThumbnails(fail=True), jobs)(
        job({"sourceId": "s1"}), lambda _: None
    )

    assert result["thumbnailPath"] is None
    assert "s1" in sources.saved
    assert [queued.type for queued in jobs.jobs.values()] == ["transcribe"]


def test_ingest_queues_transcribe_before_the_proxy_is_made() -> None:
    sources, jobs = FakeSources(), InMemoryJobRepository()

    class OrderedMedia(FakeMedia):
        def make_proxy(self, *args: object, **kwargs: object) -> None:
            # Saat proxy dibuat, audio sudah tersimpan & transkripsi sudah antre.
            assert sources.events == ["save_audio"]
            assert [j.type for j in jobs.jobs.values()] == ["transcribe"]
            sources.events.append("make_proxy")
            return super().make_proxy(*args, **kwargs)  # type: ignore[arg-type]

    IngestJob(sources, OrderedMedia(INFO), FakeThumbnails(), jobs)(
        job({"sourceId": "s1"}), lambda _: None
    )

    assert sources.events == ["save_audio", "make_proxy", "save_media"]
    assert sources.audio["s1"] == (60_000, "media/p1/audio.wav", None)


def test_ingest_with_audio_ready_only_makes_proxy_and_does_not_queue_transcribe() -> None:
    sources, media, jobs = FakeSources(), FakeMedia(INFO), InMemoryJobRepository()
    progress: list[float] = []

    result = IngestJob(sources, media, FakeThumbnails(), jobs)(
        job({"sourceId": "s1", "audioReady": True}), progress.append
    )

    assert [call[0] for call in media.calls] == ["probe", "proxy"]
    assert sources.audio == {}
    assert sources.saved["s1"][1] == "media/p1/audio.wav"
    assert jobs.jobs == {}
    assert result["transcribeJobId"] is None
    assert progress == sorted(progress) and progress[-1] == 95


def test_ingest_audio_ready_accepts_video_without_audio_track() -> None:
    media = FakeMedia(MediaInfo(duration_ms=1000, width=10, height=10, fps=None, has_audio=False))
    IngestJob(FakeSources(), media, FakeThumbnails(), InMemoryJobRepository())(
        job({"sourceId": "s1", "audioReady": True}), lambda _: None
    )


def test_repeated_ingest_does_not_extract_audio_or_queue_transcribe_again() -> None:
    # Audio sudah pernah disimpan (ingest pertama gagal di proxy) → tidak diekstrak/diantre lagi.
    sources, media, jobs = (
        FakeSources(audio_path="media/p1/audio.wav"),
        FakeMedia(INFO),
        (InMemoryJobRepository()),
    )

    result = IngestJob(sources, media, FakeThumbnails(), jobs)(
        job({"sourceId": "s1"}), lambda _: None
    )

    assert [call[0] for call in media.calls] == ["probe", "proxy"]
    assert jobs.jobs == {} and result["transcribeJobId"] is None


def test_ingest_queues_reframe_when_clips_were_found_before_the_proxy_was_ready() -> None:
    sources, jobs = FakeSources(), InMemoryJobRepository()

    result = IngestJob(
        sources, FakeMedia(INFO), FakeThumbnails(), jobs, FakeSourceClips("c1", "c2")
    )(job({"sourceId": "s1", "audioReady": True}), lambda _: None)

    [reframe] = jobs.jobs.values()
    assert (reframe.type, reframe.project_id, reframe.payload) == (
        "reframe",
        "p1",
        {"clipIds": ["c1", "c2"]},
    )
    assert result["reframeJobId"] == reframe.id


def test_ingest_queues_no_reframe_without_clips() -> None:
    jobs = InMemoryJobRepository()
    result = IngestJob(FakeSources(), FakeMedia(INFO), FakeThumbnails(), jobs, FakeSourceClips())(
        job({"sourceId": "s1", "audioReady": True}), lambda _: None
    )
    assert jobs.jobs == {} and result["reframeJobId"] is None
