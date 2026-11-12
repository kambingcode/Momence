"""Adapter yt-dlp. Uji unduhan sungguhan (butuh internet) hanya bila
`CLIPSTUDIO_LIVE_YOUTUBE=1`; videonya bisa diganti dengan `CLIPSTUDIO_YOUTUBE_TEST_URL`."""

import json
import os
import subprocess
import threading
import types
from pathlib import Path
from typing import Any, ClassVar

import pytest

from clipstudio_worker.modules.projects.application import VideoDownloadError
from clipstudio_worker.modules.projects.infrastructure import (
    yt_dlp_video_downloader as downloader_module,
)
from clipstudio_worker.modules.projects.infrastructure.yt_dlp_video_downloader import (
    MAX_RESOLUTION,
    DownloadProgress,
    YtDlpVideoDownloader,
    estimated_bytes,
)

GIB = 1024**3

# "Me at the zoo" (19 dtk), video publik pertama YouTube.
DEFAULT_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"


def test_progress_covers_video_and_audio_streams_and_never_decreases() -> None:
    seen: list[float] = []
    hook = DownloadProgress(seen.append)
    info = {"requested_formats": [{"filesize": 900}, {"filesize_approx": 100}]}

    hook({"status": "downloading", "filename": "v", "downloaded_bytes": 450, "info_dict": info})
    hook({"status": "finished", "filename": "v", "downloaded_bytes": 900, "total_bytes": 900,
          "info_dict": info})  # fmt: skip
    hook({"status": "downloading", "filename": "a", "downloaded_bytes": 50,
          "total_bytes": 120, "info_dict": info})  # fmt: skip
    # Turun (mis. unduhan diulang) → tidak dilaporkan.
    hook({"status": "downloading", "filename": "a", "downloaded_bytes": 40,
          "total_bytes": 120, "info_dict": info})  # fmt: skip
    hook({"status": "finished", "filename": "a", "downloaded_bytes": 120, "total_bytes": 120,
          "info_dict": info})  # fmt: skip
    hook({"status": "error", "filename": "a", "info_dict": info})

    assert seen == [0.45, 0.9, 950 / 1020, 1.0]


def test_progress_single_file_without_known_size_uses_estimate() -> None:
    seen: list[float] = []
    hook = DownloadProgress(seen.append)
    hook({"status": "downloading", "filename": "f", "downloaded_bytes": 0, "info_dict": {}})
    hook({"status": "downloading", "filename": "f", "downloaded_bytes": 30,
          "total_bytes_estimate": 120, "info_dict": {}})  # fmt: skip
    assert seen == [0.25]


def test_progress_from_parallel_fragment_threads_stays_monotonic() -> None:
    # Unduhan fragmen paralel: yt-dlp memanggil hook dari banyak thread, nilainya bisa mundur.
    seen: list[float] = []
    hook = DownloadProgress(seen.append)
    info = {"requested_formats": [{"filesize": 8000}]}

    def fragments(offset: int) -> None:
        for step in range(1000):
            downloaded = (step * 8 + offset) % 8000
            hook({"status": "downloading", "filename": "v", "downloaded_bytes": downloaded,
                  "info_dict": info})  # fmt: skip

    threads = [threading.Thread(target=fragments, args=(i,)) for i in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert seen == sorted(seen) and len(seen) == len(set(seen))
    assert 0 < seen[-1] <= 1.0


def test_target_outside_data_dir_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="di luar"):
        YtDlpVideoDownloader(tmp_path).download(DEFAULT_URL, "../luar.mp4", print)


def test_estimated_bytes_prefers_file_size_then_bitrate_times_duration() -> None:
    assert (
        estimated_bytes({"requested_formats": [{"filesize": 900}, {"filesize_approx": 100}]})
        == 1000
    )
    # VOD Twitch: satu format HLS tanpa ukuran, 6390 kbit/s selama 9697 dtk ≈ 7,7 GB.
    hls = {"duration": 9697, "requested_formats": [{"tbr": 6390.13}]}
    assert estimated_bytes(hls) == int(6390.13 * 1000 / 8 * 9697)
    # Tanpa petunjuk ukuran sama sekali → 0 (cek disk dilewati).
    assert estimated_bytes({"duration": 60}) == 0


class _FakeYoutubeDL:
    """Pengganti `yt_dlp.YoutubeDL`: hanya `extract_info`; mencatat bila unduhan dimulai."""

    downloads = 0
    last_options: ClassVar[dict[str, Any]] = {}

    def __init__(self, options: dict[str, Any]) -> None:
        self.options = options
        type(self).last_options = options

    def __enter__(self) -> "_FakeYoutubeDL":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def extract_info(self, url: str, download: bool) -> dict[str, Any]:
        return {"title": "VOD", "requested_formats": [{"filesize": 10 * GIB}, {"filesize": GIB}]}

    def process_ie_result(self, info: dict[str, Any], download: bool) -> dict[str, Any]:
        type(self).downloads += 1
        return info


def _fake_module(name: str) -> Any:
    if name == "yt_dlp":
        return types.SimpleNamespace(YoutubeDL=_FakeYoutubeDL)
    return types.SimpleNamespace(DownloadError=RuntimeError)


def test_fails_fast_when_disk_is_too_small(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(downloader_module, "_module", _fake_module)
    _FakeYoutubeDL.downloads = 0
    downloader = YtDlpVideoDownloader(tmp_path, free_bytes=lambda _: 20 * GIB)

    # 11 GB → butuh 2×11 + 2 = 24 GB, tersisa 20 GB.
    with pytest.raises(VideoDownloadError, match=r"butuh ±24\.0 GB, tersisa 20\.0 GB"):
        downloader.download("https://www.twitch.tv/videos/1", "media/p1/source.mp4", print)

    assert _FakeYoutubeDL.downloads == 0
    assert list((tmp_path / "media" / "p1").iterdir()) == []


def test_resolution_choice_sets_the_format_sort_and_defaults_to_1080(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(downloader_module, "_module", _fake_module)
    downloader = YtDlpVideoDownloader(tmp_path, free_bytes=lambda _: 0)
    for chosen, expected in ((None, "res:1080"), (1080, "res:1080"), (720, "res:720")):
        with pytest.raises(VideoDownloadError, match="butuh"):
            downloader.download(
                "https://www.twitch.tv/videos/1", "media/p1/source.mp4", print, chosen
            )
        assert _FakeYoutubeDL.last_options["format_sort"][0] == expected


def test_parallel_fragment_downloads_are_passed_to_yt_dlp(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(downloader_module, "_module", _fake_module)
    for fragments, expected in ((None, 1), (8, 8)):
        downloader = (
            YtDlpVideoDownloader(tmp_path, free_bytes=lambda _: 0)
            if fragments is None
            else YtDlpVideoDownloader(
                tmp_path, free_bytes=lambda _: 0, concurrent_fragments=fragments
            )
        )
        with pytest.raises(VideoDownloadError, match="butuh"):
            downloader.download("https://www.twitch.tv/videos/1", "media/p1/source.mp4", print)
        assert _FakeYoutubeDL.last_options["concurrent_fragment_downloads"] == expected

    with pytest.raises(ValueError, match="minimal 1"):
        YtDlpVideoDownloader(tmp_path, concurrent_fragments=0)


class _AudioYoutubeDL(_FakeYoutubeDL):
    """Seperti `_FakeYoutubeDL`, tetapi `process_ie_result` menulis file hasil ExtractAudio."""

    write_output = True

    def extract_info(self, url: str, download: bool) -> dict[str, Any]:
        return {"title": "Stream", "requested_formats": [{"filesize": 70_000_000}]}

    def process_ie_result(self, info: dict[str, Any], download: bool) -> dict[str, Any]:
        outtmpl = Path(self.options["outtmpl"].replace("%(ext)s", "wav"))
        if type(self).write_output:
            outtmpl.write_bytes(b"RIFF-wav")
        # Sisa unduhan sementara yang harus ikut dibersihkan.
        outtmpl.with_suffix(".m4a.part").write_bytes(b"x")
        return info


def _audio_module(name: str) -> Any:
    if name == "yt_dlp":
        return types.SimpleNamespace(YoutubeDL=_AudioYoutubeDL)
    return types.SimpleNamespace(DownloadError=RuntimeError)


def test_download_audio_extracts_16khz_mono_wav_next_to_a_running_video_download(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(downloader_module, "_module", _audio_module)
    _AudioYoutubeDL.write_output = True
    folder = tmp_path / "media" / "p1"
    folder.mkdir(parents=True)
    # Unduhan video yang sedang berjalan di folder yang sama tidak boleh ikut terhapus.
    (folder / ".source.download.mp4.part").write_bytes(b"video")
    progress: list[float] = []

    audio = YtDlpVideoDownloader(tmp_path, concurrent_fragments=8).download_audio(
        "https://www.twitch.tv/videos/1", "media/p1/audio.wav", progress.append
    )

    options = _AudioYoutubeDL.last_options
    assert audio.title == "Stream"
    assert options["format"] == "ba/wa/w"
    assert options["postprocessors"] == [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}]
    assert options["postprocessor_args"] == {"extractaudio": ["-ac", "1", "-ar", "16000"]}
    assert options["concurrent_fragment_downloads"] == 8
    assert (folder / "audio.wav").read_bytes() == b"RIFF-wav"
    assert sorted(p.name for p in folder.iterdir()) == [".source.download.mp4.part", "audio.wav"]
    assert progress[-1] == 1.0


def test_download_audio_without_output_file_fails_and_cleans_up(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(downloader_module, "_module", _audio_module)
    _AudioYoutubeDL.write_output = False

    with pytest.raises(VideoDownloadError, match="file hasil tidak ditemukan"):
        YtDlpVideoDownloader(tmp_path).download_audio(
            "https://www.twitch.tv/videos/1", "media/p1/audio.wav", print
        )

    assert list((tmp_path / "media" / "p1").iterdir()) == []


live = pytest.mark.skipif(
    os.environ.get("CLIPSTUDIO_LIVE_YOUTUBE") != "1",
    reason="uji unduhan YouTube sungguhan (butuh internet): set CLIPSTUDIO_LIVE_YOUTUBE=1",
)


@live
def test_downloads_youtube_video_as_mp4_up_to_1080p(tmp_path: Path) -> None:
    url = os.environ.get("CLIPSTUDIO_YOUTUBE_TEST_URL", DEFAULT_URL)
    progress: list[float] = []

    video = YtDlpVideoDownloader(tmp_path).download(url, "media/p1/source.mp4", progress.append)

    target = tmp_path / "media" / "p1" / "source.mp4"
    assert video.size_bytes == target.stat().st_size > 0
    assert video.title
    assert progress and progress == sorted(progress) and progress[-1] == 1.0
    assert sorted(p.name for p in target.parent.iterdir()) == ["source.mp4"]

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams",
         str(target)],
        capture_output=True, text=True, check=True,
    )  # fmt: skip
    data = json.loads(probe.stdout)
    assert "mp4" in data["format"]["format_name"]
    kinds = {s["codec_type"]: s for s in data["streams"]}
    assert {"video", "audio"} <= kinds.keys()
    video_stream = kinds["video"]
    assert min(int(video_stream["width"]), int(video_stream["height"])) <= MAX_RESOLUTION


@live
def test_unavailable_video_raises_user_message(tmp_path: Path) -> None:
    with pytest.raises(VideoDownloadError, match="tidak tersedia"):
        YtDlpVideoDownloader(tmp_path).download(
            "https://www.youtube.com/watch?v=aaaaaaaaaaa", "media/p1/source.mp4", print
        )
    assert not any((tmp_path / "media" / "p1").iterdir())


@pytest.mark.skipif(
    not os.environ.get("CLIPSTUDIO_TWITCH_TEST_URL")
    or os.environ.get("CLIPSTUDIO_LIVE_TWITCH") != "1",
    reason="uji VOD Twitch sungguhan: set CLIPSTUDIO_LIVE_TWITCH=1 dan CLIPSTUDIO_TWITCH_TEST_URL",
)
def test_downloads_twitch_vod_as_mp4(tmp_path: Path) -> None:
    progress: list[float] = []

    video = YtDlpVideoDownloader(tmp_path).download(
        os.environ["CLIPSTUDIO_TWITCH_TEST_URL"], "media/p1/source.mp4", progress.append
    )

    target = tmp_path / "media" / "p1" / "source.mp4"
    assert video.size_bytes == target.stat().st_size > 0
    assert progress and progress == sorted(progress) and progress[-1] == 1.0
    assert sorted(p.name for p in target.parent.iterdir()) == ["source.mp4"]


@pytest.mark.skipif(
    not os.environ.get("CLIPSTUDIO_TWITCH_TEST_URL")
    or os.environ.get("CLIPSTUDIO_LIVE_TWITCH") != "1",
    reason="uji VOD Twitch sungguhan: set CLIPSTUDIO_LIVE_TWITCH=1 dan CLIPSTUDIO_TWITCH_TEST_URL",
)
def test_downloads_twitch_vod_audio_as_16khz_mono_wav(tmp_path: Path) -> None:
    progress: list[float] = []

    audio = YtDlpVideoDownloader(tmp_path, concurrent_fragments=8).download_audio(
        os.environ["CLIPSTUDIO_TWITCH_TEST_URL"], "media/p1/audio.wav", progress.append
    )

    target = tmp_path / "media" / "p1" / "audio.wav"
    assert audio.title
    assert progress and progress == sorted(progress) and progress[-1] == 1.0
    assert sorted(p.name for p in target.parent.iterdir()) == ["audio.wav"]
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels",
         "-of", "json", str(target)],
        capture_output=True, text=True, check=True,
    )  # fmt: skip
    [stream] = json.loads(probe.stdout)["streams"]
    assert (stream["codec_name"], stream["sample_rate"], stream["channels"]) == (
        "pcm_s16le",
        "16000",
        1,
    )
