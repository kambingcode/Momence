import pytest
from pydantic import ValidationError

from clipstudio_worker.modules.jobs.application import Job, JobFailure
from clipstudio_worker.modules.projects.application import (
    DownloadedVideo,
    DownloadVideoJob,
    MediaInfo,
    SourceRecord,
    SourceRepository,
    StepProgress,
    VideoDownloader,
    VideoDownloadError,
)
from clipstudio_worker.modules.projects.application.payloads import DownloadPayload
from clipstudio_worker.modules.projects.domain.download import (
    download_failure_message,
    insufficient_disk_message,
    project_name_from_title,
)
from tests.modules.jobs.fakes import InMemoryJobRepository

URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


class FakeSources(SourceRepository):
    def __init__(self) -> None:
        self.records = {"s1": SourceRecord(id="s1", project_id="p1", path="media/p1/source.mp4")}
        self.downloads: dict[str, tuple[int, str]] = {}

    def get(self, source_id: str) -> SourceRecord | None:
        return self.records.get(source_id)

    def save_audio(
        self, source_id: str, duration_ms: int, audio_path: str, project_name: str | None
    ) -> None:
        raise AssertionError("tidak dipakai")

    def save_media(self, source_id: str, info: MediaInfo, audio_path: str, proxy_path: str) -> None:
        raise AssertionError("tidak dipakai")

    def save_download(self, source_id: str, size_bytes: int, project_name: str) -> None:
        self.downloads[source_id] = (size_bytes, project_name)


class FakeDownloader(VideoDownloader):
    def __init__(self, result: DownloadedVideo | Exception) -> None:
        self.result = result
        self.calls: list[tuple[str, str]] = []
        self.resolutions: list[int | None] = []

    def download(
        self,
        url: str,
        target: str,
        on_progress: StepProgress,
        max_resolution: int | None = None,
    ) -> DownloadedVideo:
        self.calls.append((url, target))
        self.resolutions.append(max_resolution)
        if isinstance(self.result, Exception):
            raise self.result
        on_progress(0.25)
        on_progress(1.0)
        return self.result


def job(payload: object) -> Job:
    return Job(
        id="j1",
        project_id="p1",
        type="download",
        status="running",
        progress=0,
        payload=payload,
        attempts=1,
    )


def test_download_saves_size_and_title_then_queues_ingest() -> None:
    sources, jobs = FakeSources(), InMemoryJobRepository()
    downloader = FakeDownloader(DownloadedVideo(title="  Podcast\n episode 1 ", size_bytes=1234))
    progress: list[float] = []

    result = DownloadVideoJob(sources, downloader, jobs)(
        job({"sourceId": "s1", "url": URL}), progress.append
    )

    assert downloader.calls == [(URL, "media/p1/source.mp4")]
    assert sources.downloads["s1"] == (1234, "Podcast episode 1")
    [queued] = jobs.jobs.values()
    assert (queued.type, queued.project_id, queued.payload) == ("ingest", "p1", {"sourceId": "s1"})
    assert result == {
        "title": "  Podcast\n episode 1 ",
        "sizeBytes": 1234,
        "maxResolution": None,
        "ingestJobId": queued.id,
    }
    assert progress == [24.75, 99.0]


def test_download_failure_becomes_job_failure_without_queueing_ingest() -> None:
    sources, jobs = FakeSources(), InMemoryJobRepository()
    downloader = FakeDownloader(VideoDownloadError("Video ini privat."))

    with pytest.raises(JobFailure, match="Video ini privat"):
        DownloadVideoJob(sources, downloader, jobs)(job({"sourceId": "s1", "url": URL}), print)

    assert sources.downloads == {}
    assert jobs.jobs == {}


def test_empty_download_fails() -> None:
    downloader = FakeDownloader(DownloadedVideo(title="x", size_bytes=0))
    with pytest.raises(JobFailure, match="kosong"):
        DownloadVideoJob(FakeSources(), downloader, InMemoryJobRepository())(
            job({"sourceId": "s1", "url": URL}), print
        )


def test_missing_source_fails() -> None:
    downloader = FakeDownloader(DownloadedVideo(title="x", size_bytes=1))
    with pytest.raises(JobFailure, match="tidak ditemukan"):
        DownloadVideoJob(FakeSources(), downloader, InMemoryJobRepository())(
            job({"sourceId": "lain", "url": URL}), print
        )
    assert downloader.calls == []


def test_project_name_from_title() -> None:
    assert project_name_from_title("  A \t b  ", fallback="f") == "A b"
    assert project_name_from_title("", fallback="f") == "f"
    assert project_name_from_title(None, fallback="f") == "f"
    assert len(project_name_from_title("x" * 500, fallback="f")) == 120


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("ERROR: [youtube] abc: Private video. Sign in if you've been granted access", "privat"),
        ("ERROR: [youtube] abc: Sign in to confirm your age.", "dibatasi usia"),
        ("ERROR: [youtube] abc: Sign in to confirm you’re not a bot.", "deteksi bot"),
        ("ERROR: [youtube] abc: Video unavailable", "tidak tersedia (dihapus"),
        ("ERROR: [youtube] abc: This video is unavailable", "tidak tersedia (dihapus"),
        (
            "ERROR: [youtube] abc: The uploader has not made this video available in your country",
            "negara",
        ),
        ("ERROR: [youtube] abc: This live event will begin in 3 hours.", "belum dimulai"),
        ("ERROR: [twitch:vod] 123: This video is only available for subscribers", "pelanggan"),
        ("ERROR: Unable to download JSON metadata: HTTP Error 404: Not Found", "kedaluwarsa"),
        ("ERROR: Unable to download webpage: <urlopen error [Errno 8]>", "koneksi internet"),
        ("ERROR: sesuatu yang aneh", "Gagal mengunduh video: sesuatu yang aneh"),
        ("", "Gagal mengunduh video."),
    ],
)
def test_download_failure_message(raw: str, expected: str) -> None:
    assert expected in download_failure_message(raw)


def test_insufficient_disk_message() -> None:
    gib = 1024**3
    # 10 GB → butuh 2×10 + 2 = 22 GB.
    message = insufficient_disk_message(10 * gib, 21 * gib)
    assert message is not None
    assert "22.0 GB" in message and "21.0 GB" in message
    assert insufficient_disk_message(10 * gib, 22 * gib) is None
    # Ukuran tidak diketahui → tidak diblokir.
    assert insufficient_disk_message(0, 0) is None


def test_download_queues_ingest_with_audio_ready_for_audio_first_imports() -> None:
    sources, jobs = FakeSources(), InMemoryJobRepository()
    downloader = FakeDownloader(DownloadedVideo(title="Stream", size_bytes=10))

    DownloadVideoJob(sources, downloader, jobs)(
        job({"sourceId": "s1", "url": URL, "audioFirst": True}), lambda _: None
    )

    [queued] = jobs.jobs.values()
    assert queued.payload == {"sourceId": "s1", "audioReady": True}


def test_download_passes_the_chosen_resolution_and_reports_it() -> None:
    for chosen in (None, 720, 1080):
        downloader = FakeDownloader(DownloadedVideo(title="Stream", size_bytes=10))
        payload: dict[str, object] = {"sourceId": "s1", "url": URL}
        if chosen is not None:
            payload["maxResolution"] = chosen

        result = DownloadVideoJob(FakeSources(), downloader, InMemoryJobRepository())(
            job(payload), lambda _: None
        )

        assert downloader.resolutions == [chosen]
        assert result["maxResolution"] == chosen


def test_download_payload_rejects_resolutions_other_than_720_and_1080() -> None:
    with pytest.raises(ValidationError):
        DownloadPayload.model_validate({"sourceId": "s1", "url": URL, "maxResolution": 480})
