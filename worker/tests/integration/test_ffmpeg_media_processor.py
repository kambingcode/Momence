"""Tes integrasi dengan ffmpeg sungguhan; video uji dibuat dari sumber sintetis lavfi."""

import json
import shutil
import subprocess
import wave
from pathlib import Path

import pytest

from clipstudio_worker.modules.projects.application import ThumbnailError, UnsupportedMediaError
from clipstudio_worker.modules.projects.infrastructure.ffmpeg_media_processor import (
    FfmpegMediaProcessor,
)

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg tidak terpasang")


def make_video(
    path: Path, *, size: str, audio: bool = True, rotate: int | None = None, rate: int = 30
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    args = [
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"testsrc2=size={size}:rate={rate}:d=2",
    ]
    if audio:
        args += ["-f", "lavfi", "-i", "sine=frequency=440:d=2"]
    args += ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]
    if audio:
        args += ["-c:a", "aac", "-shortest"]
    if rotate is None:
        subprocess.run([*args, str(path)], check=True)
        return
    # Rotasi = metadata tampilan (seperti video ponsel); -display_rotation adalah opsi input.
    plain = path.with_name(f"plain-{path.name}")
    subprocess.run([*args, str(plain)], check=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-display_rotation:v:0", str(rotate),
         "-i", str(plain), "-c", "copy", str(path)],
        check=True,
    )  # fmt: skip
    plain.unlink()


def probe_size(path: Path) -> tuple[int, int]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()  # fmt: skip
    width, height = out.split(",")
    return int(width), int(height)


def test_probe_audio_and_proxy_for_landscape_video(tmp_path: Path) -> None:
    make_video(tmp_path / "media/p1/source.mp4", size="1920x1080")
    media = FfmpegMediaProcessor(tmp_path)

    info = media.probe("media/p1/source.mp4")
    assert (info.width, info.height, info.has_audio) == (1920, 1080, True)
    assert info.fps == 30.0
    assert 1900 <= info.duration_ms <= 2100

    progress: list[float] = []
    media.extract_audio(
        "media/p1/source.mp4", "media/p1/audio.wav", info.duration_ms, progress.append
    )
    with wave.open(str(tmp_path / "media/p1/audio.wav")) as wav:
        assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (16000, 1, 2)
    assert progress[-1] == 1.0

    media.make_proxy(
        "media/p1/source.mp4",
        "media/p1/proxy.mp4",
        (1280, 720),
        None,
        info.duration_ms,
        lambda _: None,
    )
    assert probe_size(tmp_path / "media/p1/proxy.mp4") == (1280, 720)
    assert sorted(p.name for p in (tmp_path / "media/p1").iterdir()) == [
        "audio.wav",
        "proxy.mp4",
        "source.mp4",
    ]


def test_proxy_of_60fps_source_has_30fps_and_keyframe_every_second(tmp_path: Path) -> None:
    make_video(tmp_path / "v.mp4", size="1280x720", rate=60)
    media = FfmpegMediaProcessor(tmp_path)
    info = media.probe("v.mp4")
    assert info.fps == 60

    media.make_proxy("v.mp4", "proxy.mp4", (640, 360), 30.0, info.duration_ms, lambda _: None)

    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey",
         "-show_entries", "stream=avg_frame_rate,codec_name:frame=pts_time",
         "-of", "json", str(tmp_path / "proxy.mp4")],
        capture_output=True, text=True, check=True,
    ).stdout  # fmt: skip
    data = json.loads(out)
    stream = data["streams"][0]
    assert (stream["codec_name"], stream["avg_frame_rate"]) == ("h264", "30/1")
    keyframes = [round(float(f["pts_time"])) for f in data["frames"]]
    assert keyframes == [0, 1]
    assert abs(media.probe("proxy.mp4").duration_ms - info.duration_ms) <= 100


def test_thumbnail_is_a_320px_jpeg_and_leaves_no_partial(tmp_path: Path) -> None:
    make_video(tmp_path / "media/p1/proxy.mp4", size="1280x720")
    media = FfmpegMediaProcessor(tmp_path)

    media.make("media/p1/proxy.mp4", "media/p1/thumb.jpg", 1000, 320)

    thumb = tmp_path / "media/p1/thumb.jpg"
    assert thumb.read_bytes()[:3] == b"\xff\xd8\xff"
    assert probe_size(thumb) == (320, 180)
    assert sorted(p.name for p in thumb.parent.iterdir()) == ["proxy.mp4", "thumb.jpg"]

    # Idempoten: menimpa file lama.
    media.make("media/p1/proxy.mp4", "media/p1/thumb.jpg", 500, 320)
    assert probe_size(thumb) == (320, 180)


def test_thumbnail_keeps_portrait_ratio_and_never_upscales(tmp_path: Path) -> None:
    make_video(tmp_path / "tall.mp4", size="180x320")
    FfmpegMediaProcessor(tmp_path).make("tall.mp4", "thumb.jpg", 0, 320)
    assert probe_size(tmp_path / "thumb.jpg") == (180, 320)


def test_thumbnail_past_the_end_fails_without_leaving_files(tmp_path: Path) -> None:
    make_video(tmp_path / "v.mp4", size="640x360")
    with pytest.raises(ThumbnailError):
        FfmpegMediaProcessor(tmp_path).make("v.mp4", "thumb.jpg", 60_000, 320)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["v.mp4"]


def test_thumbnail_of_corrupt_file_raises_thumbnail_error(tmp_path: Path) -> None:
    (tmp_path / "rusak.mp4").write_bytes(b"bukan video")
    with pytest.raises(ThumbnailError):
        FfmpegMediaProcessor(tmp_path).make("rusak.mp4", "thumb.jpg", 0, 320)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["rusak.mp4"]


def test_rotated_phone_video_reports_display_size(tmp_path: Path) -> None:
    make_video(tmp_path / "v.mp4", size="1280x720", rotate=90)
    media = FfmpegMediaProcessor(tmp_path)

    info = media.probe("v.mp4")
    assert (info.width, info.height) == (720, 1280)

    media.make_proxy("v.mp4", "proxy.mp4", (720, 1280), None, info.duration_ms, lambda _: None)
    assert probe_size(tmp_path / "proxy.mp4") == (720, 1280)


def test_video_without_audio_is_reported(tmp_path: Path) -> None:
    make_video(tmp_path / "silent.mp4", size="640x360", audio=False)
    assert FfmpegMediaProcessor(tmp_path).probe("silent.mp4").has_audio is False


def test_corrupt_file_raises_clear_error_and_leaves_no_partial(tmp_path: Path) -> None:
    (tmp_path / "rusak.mp4").write_bytes(b"bukan video")
    media = FfmpegMediaProcessor(tmp_path)
    with pytest.raises(UnsupportedMediaError, match="ffprobe gagal"):
        media.probe("rusak.mp4")
    with pytest.raises(RuntimeError, match="ffmpeg gagal"):
        media.extract_audio("rusak.mp4", "audio.wav", 1000, lambda _: None)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["rusak.mp4"]


def test_rejects_paths_outside_data_dir(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="di luar direktori data"):
        FfmpegMediaProcessor(tmp_path / "data").probe("../rahasia.mp4")
