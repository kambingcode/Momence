"""Tes integrasi adapter reframe: ffmpeg & PySceneDetect dengan video sintetis lavfi, MediaPipe
dengan model sungguhan (dilewati bila model belum pernah diunduh worker)."""

import os
import shutil
import subprocess
import time
from pathlib import Path

import numpy as np
import pytest

from clipstudio_worker.modules.reframe.application import ReframeError
from clipstudio_worker.modules.reframe.domain.analysis import FRAME_FPS, frame_time_ms
from clipstudio_worker.modules.reframe.infrastructure.ffmpeg_frame_reader import (
    FfmpegFrameReader,
)
from clipstudio_worker.modules.reframe.infrastructure.mediapipe_face_detector import (
    MODEL_FILE,
    MediaPipeFaceDetector,
)
from clipstudio_worker.modules.reframe.infrastructure.pyscenedetect_cut_detector import (
    PySceneDetectCutDetector,
)

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg tidak terpasang")

# Model yang sudah diunduh worker ke `<data>/models` (CLIPSTUDIO_DATA_DIR atau `data/` repo).
_DATA_DIR = os.environ.get("CLIPSTUDIO_DATA_DIR") or Path(__file__).resolve().parents[3] / "data"
CACHED_MODEL = Path(_DATA_DIR) / "models" / MODEL_FILE


def make_scene_video(path: Path) -> None:
    """6 dtk, tiga adegan 2 dtk: merah polos, testsrc2 bergerak, biru polos (cut di 2 & 4 dtk)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y",
         "-f", "lavfi", "-i", "color=c=red:size=320x180:rate=30:d=2",
         "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:d=2",
         "-f", "lavfi", "-i", "color=c=blue:size=320x180:rate=30:d=2",
         "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p",
         "-c:v", "libx264", "-preset", "ultrafast", str(path)],
        check=True,
    )  # fmt: skip


@pytest.fixture
def scene_video(tmp_path: Path) -> Path:
    make_scene_video(tmp_path / "media" / "p1" / "proxy.mp4")
    return tmp_path


def test_reads_fixed_rate_scaled_rgb_frames_of_range(scene_video: Path) -> None:
    reader = FfmpegFrameReader(scene_video)

    frames = list(reader.read("media/p1/proxy.mp4", 1_000, 3_000, FRAME_FPS, (64, 36)))

    assert len(frames) == 30
    assert all(f.shape == (36, 64, 3) and f.dtype == np.uint8 for f in frames)
    # Frame pertama = 1 dtk (masih merah), frame setelah 2 dtk = testsrc2 (bukan merah polos).
    red = frames[0][18, 32]
    assert red[0] > 200 and red[1] < 60 and red[2] < 60
    assert frame_time_ms(1_000, 15) == 2_000
    assert not np.array_equal(frames[16], frames[0])


def test_closing_early_stops_ffmpeg(scene_video: Path) -> None:
    frames = FfmpegFrameReader(scene_video).read(
        "media/p1/proxy.mp4", 0, 6_000, FRAME_FPS, (64, 36)
    )
    next(frames)
    started = time.monotonic()
    frames.close()
    assert time.monotonic() - started < 2


def test_missing_or_corrupt_video_raises_reframe_error(tmp_path: Path) -> None:
    reader = FfmpegFrameReader(tmp_path)
    with pytest.raises(ReframeError, match="tidak ditemukan"):
        list(reader.read("media/p1/hilang.mp4", 0, 1_000, FRAME_FPS, (64, 36)))

    corrupt = tmp_path / "media" / "rusak.mp4"
    corrupt.parent.mkdir(parents=True)
    corrupt.write_text("bukan video")
    with pytest.raises(ReframeError, match="ffmpeg gagal membaca video"):
        list(reader.read("media/rusak.mp4", 0, 1_000, FRAME_FPS, (64, 36)))

    with pytest.raises(ValueError, match="di luar direktori data"):
        list(reader.read("../luar.mp4", 0, 1_000, FRAME_FPS, (64, 36)))

    no_ffmpeg = FfmpegFrameReader(tmp_path, ffmpeg="ffmpeg-tidak-ada")
    with pytest.raises(ReframeError, match="tidak ditemukan"):
        list(no_ffmpeg.read("media/rusak.mp4", 0, 1_000, FRAME_FPS, (64, 36)))


def test_scene_cuts_found_at_hard_cuts(scene_video: Path) -> None:
    session = PySceneDetectCutDetector().start(FRAME_FPS)
    for frame in FfmpegFrameReader(scene_video).read(
        "media/p1/proxy.mp4", 0, 6_000, FRAME_FPS, (160, 90)
    ):
        session.push(frame)

    assert [frame_time_ms(0, cut) for cut in session.finish()] == [2_000, 4_000]


def test_model_download_rejects_wrong_checksum(tmp_path: Path) -> None:
    wrong = tmp_path / "palsu.tflite"
    wrong.write_bytes(b"bukan model")
    detector = MediaPipeFaceDetector(tmp_path / "models", model_url=wrong.as_uri())

    with pytest.raises(ReframeError, match="checksum"):
        detector.detect(np.zeros((36, 64, 3), dtype=np.uint8))
    assert list((tmp_path / "models").iterdir()) == []  # tidak ada sisa file sementara


def test_model_download_failure_raises_reframe_error(tmp_path: Path) -> None:
    detector = MediaPipeFaceDetector(tmp_path / "models", model_url=(tmp_path / "x").as_uri())
    with pytest.raises(ReframeError, match="gagal diunduh"):
        detector.detect(np.zeros((36, 64, 3), dtype=np.uint8))


@pytest.mark.skipif(not CACHED_MODEL.is_file(), reason="model wajah belum diunduh worker")
def test_cached_model_is_reused_and_blank_frame_has_no_faces(tmp_path: Path) -> None:
    models = tmp_path / "models"
    models.mkdir()
    shutil.copy(CACHED_MODEL, models / MODEL_FILE)
    # URL tidak valid: model yang checksum-nya cocok tidak diunduh ulang.
    detector = MediaPipeFaceDetector(models, model_url=(tmp_path / "x").as_uri())

    assert detector.detect(np.zeros((360, 640, 3), dtype=np.uint8)) == []


@pytest.mark.skipif(
    not CACHED_MODEL.is_file() or not os.environ.get("CLIPSTUDIO_FACE_TEST_VIDEO"),
    reason="butuh model wajah & CLIPSTUDIO_FACE_TEST_VIDEO (video berisi wajah di detik 0–2)",
)
def test_detects_faces_in_real_video() -> None:
    video = Path(os.environ["CLIPSTUDIO_FACE_TEST_VIDEO"]).resolve()
    detector = MediaPipeFaceDetector(CACHED_MODEL.parent)

    frames = FfmpegFrameReader(video.parent).read(video.name, 0, 2_000, 5, (640, 360))
    found = [detector.detect(frame) for frame in frames]

    assert sum(1 for faces in found if faces) >= 8
    for face in (face for faces in found for face in faces):
        assert 0 <= face.x <= 1 and 0 <= face.y <= 1 and face.score >= 0.6
