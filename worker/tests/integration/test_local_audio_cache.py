from pathlib import Path

import pytest

from clipstudio_worker.modules.projects.application import MediaInfo, StepProgress
from clipstudio_worker.modules.transcript.application import AudioUnavailableError
from clipstudio_worker.modules.transcript.infrastructure.local_audio_cache import LocalAudioCache


class FakeMedia:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.extracted: list[tuple[str, str, int]] = []

    def probe(self, path: str) -> MediaInfo:
        raise NotImplementedError

    def extract_audio(
        self, source: str, target: str, duration_ms: int, on_progress: StepProgress
    ) -> None:
        self.extracted.append((source, target, duration_ms))
        (self.data_dir / target).write_bytes(b"wav")

    def audio_duration_ms(self, path: str) -> int:
        raise NotImplementedError

    def make_proxy(
        self,
        source: str,
        target: str,
        size: tuple[int, int],
        frame_rate: float | None,
        duration_ms: int,
        on_progress: StepProgress,
    ) -> None:
        raise NotImplementedError


def test_ensure_extracts_only_when_missing_and_discard_removes(tmp_path: Path) -> None:
    (tmp_path / "media" / "p1").mkdir(parents=True)
    (tmp_path / "media" / "p1" / "source.mp4").write_bytes(b"video")
    media = FakeMedia(tmp_path)
    cache = LocalAudioCache(tmp_path, media)
    audio = tmp_path / "media" / "p1" / "audio.wav"

    cache.ensure("media/p1/source.mp4", "media/p1/audio.wav", 5_000)
    cache.ensure("media/p1/source.mp4", "media/p1/audio.wav", 5_000)  # sudah ada
    assert media.extracted == [("media/p1/source.mp4", "media/p1/audio.wav", 5_000)]
    assert audio.read_bytes() == b"wav"

    cache.discard("media/p1/audio.wav")
    cache.discard("media/p1/audio.wav")  # sudah tidak ada → diam
    cache.discard("../luar.wav")  # di luar direktori data → hanya dicatat
    assert not audio.exists()


def test_ensure_fails_clearly_when_audio_and_source_video_are_both_missing(tmp_path: Path) -> None:
    # Impor dari link: audio sudah dihapus setelah transkripsi dan video masih diunduh.
    (tmp_path / "media" / "p1").mkdir(parents=True)
    media = FakeMedia(tmp_path)

    with pytest.raises(AudioUnavailableError, match="belum ada"):
        LocalAudioCache(tmp_path, media).ensure("media/p1/source.mp4", "media/p1/audio.wav", 5_000)

    assert media.extracted == []
