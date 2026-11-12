from collections.abc import Mapping
from typing import Any

import pytest

from clipstudio_worker.modules.jobs.application import Job, JobFailure
from clipstudio_worker.modules.projects.application import (
    AudioDownloader,
    DownloadAudioJob,
    DownloadedAudio,
    MediaInfo,
    MediaProcessor,
    SourceRecord,
    SourceRepository,
    StepProgress,
    UnsupportedMediaError,
    VideoDownloadError,
)
from tests.modules.jobs.fakes import InMemoryJobRepository

URL = "https://www.twitch.tv/videos/2907356012"


class FakeSources(SourceRepository):
    def __init__(self) -> None:
        self.records = {"s1": SourceRecord(id="s1", project_id="p1", path="media/p1/source.mp4")}
        self.audio: dict[str, tuple[int, str, str | None]] = {}

    def get(self, source_id: str) -> SourceRecord | None:
        return self.records.get(source_id)

    def save_audio(
        self, source_id: str, duration_ms: int, audio_path: str, project_name: str | None
    ) -> None:
        self.audio[source_id] = (duration_ms, audio_path, project_name)

    def save_media(self, source_id: str, info: MediaInfo, audio_path: str, proxy_path: str) -> None:
        raise AssertionError("tidak dipakai")

    def save_download(self, source_id: str, size_bytes: int, project_name: str) -> None:
        raise AssertionError("tidak dipakai")


class FakeAudioDownloader(AudioDownloader):
    def __init__(self, result: DownloadedAudio | Exception) -> None:
        self.result = result
        self.calls: list[tuple[str, str]] = []

    def download_audio(self, url: str, target: str, on_progress: StepProgress) -> DownloadedAudio:
        self.calls.append((url, target))
        if isinstance(self.result, Exception):
            raise self.result
        on_progress(0.5)
        on_progress(1.0)
        return self.result


class FakeMedia(MediaProcessor):
    def __init__(self, duration_ms: int | Exception) -> None:
        self.duration_ms = duration_ms
        self.probed: list[str] = []

    def probe(self, path: str) -> MediaInfo:
        raise AssertionError("tidak dipakai")

    def audio_duration_ms(self, path: str) -> int:
        self.probed.append(path)
        if isinstance(self.duration_ms, Exception):
            raise self.duration_ms
        return self.duration_ms

    def extract_audio(self, *args: object, **kwargs: object) -> None:
        raise AssertionError("tidak dipakai")

    def make_proxy(self, *args: object, **kwargs: object) -> None:
        raise AssertionError("tidak dipakai")


def job(payload: object) -> Job:
    return Job(
        id="j1",
        project_id="p1",
        type="download-audio",
        status="running",
        progress=0,
        payload=payload,
        attempts=1,
    )


def run(
    downloader: AudioDownloader, media: MediaProcessor, source: str = "s1"
) -> tuple[FakeSources, InMemoryJobRepository, list[float], Mapping[str, Any]]:
    sources, jobs, progress = FakeSources(), InMemoryJobRepository(), list[float]()
    result = DownloadAudioJob(sources, downloader, media, jobs)(
        job({"sourceId": source, "url": URL}), progress.append
    )
    return sources, jobs, progress, result


def test_saves_audio_and_title_then_queues_transcribe() -> None:
    downloader = FakeAudioDownloader(DownloadedAudio(title="  Daddy's\n Home "))
    media = FakeMedia(9_697_152)

    sources, jobs, progress, result = run(downloader, media)

    assert downloader.calls == [(URL, "media/p1/audio.wav")]
    assert media.probed == ["media/p1/audio.wav"]
    assert sources.audio["s1"] == (9_697_152, "media/p1/audio.wav", "Daddy's Home")
    [queued] = jobs.jobs.values()
    assert (queued.type, queued.project_id, queued.payload) == (
        "transcribe",
        "p1",
        {"sourceId": "s1"},
    )
    assert result["transcribeJobId"] == queued.id
    assert progress == sorted(progress) and progress[-1] == pytest.approx(99)


def test_falls_back_to_url_when_title_is_missing() -> None:
    sources, *_ = run(FakeAudioDownloader(DownloadedAudio(title=None)), FakeMedia(1000))
    assert sources.audio["s1"][2] == URL


def test_download_error_fails_job_with_user_message_and_queues_nothing() -> None:
    sources, jobs = FakeSources(), InMemoryJobRepository()
    downloader = FakeAudioDownloader(VideoDownloadError("VOD ini khusus pelanggan."))
    with pytest.raises(JobFailure, match="khusus pelanggan"):
        DownloadAudioJob(sources, downloader, FakeMedia(1000), jobs)(
            job({"sourceId": "s1", "url": URL}), lambda _: None
        )
    assert sources.audio == {} and jobs.jobs == {}


@pytest.mark.parametrize("duration", [UnsupportedMediaError("Durasi audio tidak terbaca"), 0])
def test_unreadable_audio_fails_job(duration: int | Exception) -> None:
    sources, jobs = FakeSources(), InMemoryJobRepository()
    with pytest.raises(JobFailure, match="tidak terbaca"):
        DownloadAudioJob(
            sources, FakeAudioDownloader(DownloadedAudio("x")), FakeMedia(duration), jobs
        )(job({"sourceId": "s1", "url": URL}), lambda _: None)
    assert sources.audio == {} and jobs.jobs == {}


def test_unknown_source_fails() -> None:
    with pytest.raises(JobFailure, match="tidak ditemukan"):
        run(FakeAudioDownloader(DownloadedAudio("x")), FakeMedia(1000), source="hilang")
