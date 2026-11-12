from collections.abc import Generator, Mapping, Sequence

import numpy as np
import pytest

from clipstudio_worker.modules.jobs.application import Job, JobFailure
from clipstudio_worker.modules.reframe.application import (
    ANALYSIS_VERSION,
    CROP_VERSION,
    AnalyzeReframeJob,
    ClipAnalysis,
    ClipVideo,
    CropKeyframe,
    FaceBox,
    FaceDetector,
    FaceSample,
    Frame,
    FrameReader,
    ReframeError,
    ReframeRepository,
    SceneCutDetector,
    SceneCutSession,
    StoredReframe,
)


def video(clip_id: str = "c1", start_ms: int = 10_000, end_ms: int = 11_000) -> ClipVideo:
    return ClipVideo(clip_id, start_ms, end_ms, "media/p1/proxy.mp4", 1920, 1080)


def stored_analysis(clip: ClipVideo) -> ClipAnalysis:
    """Analisis tersimpan: satu wajah diam di setiap sampel."""
    samples = tuple(
        FaceSample(t, (FaceBox(0.45, 0.3, 0.1, 0.2, 0.9),))
        for t in range(clip.start_ms, clip.end_ms, 200)
    )
    return ClipAnalysis(clip.start_ms, clip.end_ms, 1920, 1080, samples, ())


class FakeRepository(ReframeRepository):
    def __init__(self, *videos: ClipVideo) -> None:
        self.videos = {v.clip_id: v for v in videos}
        self.stored_rows: dict[str, StoredReframe] = {}
        self.saved: dict[str, tuple[int, ClipAnalysis, int, dict[str, list[CropKeyframe]]]] = {}
        self.deleted_before_save: set[str] = set()

    def clip_video(self, clip_id: str) -> ClipVideo | None:
        return self.videos.get(clip_id)

    def stored(self, clip_id: str) -> StoredReframe | None:
        return self.stored_rows.get(clip_id)

    def save(
        self,
        clip_id: str,
        version: int,
        analysis: ClipAnalysis,
        crop_version: int,
        crops: Mapping[str, Sequence[CropKeyframe]],
    ) -> bool:
        if clip_id in self.deleted_before_save:
            return False
        self.saved[clip_id] = (
            version,
            analysis,
            crop_version,
            {ratio: list(keys) for ratio, keys in crops.items()},
        )
        return True


class FakeFrames(FrameReader):
    """Frame ke-i berisi nilai i (agar detektor palsu tahu frame mana yang diterimanya)."""

    def __init__(self, fail_paths: tuple[str, ...] = ()) -> None:
        self.requests: list[tuple[str, int, int, float, tuple[int, int]]] = []
        self.closed = 0
        self.fail_paths = fail_paths

    def read(
        self, path: str, start_ms: int, end_ms: int, fps: float, size: tuple[int, int]
    ) -> Generator[Frame, None, None]:
        self.requests.append((path, start_ms, end_ms, fps, size))
        if path in self.fail_paths:
            raise ReframeError("ffmpeg gagal membaca video: rusak")
        count = round((end_ms - start_ms) * fps / 1000)
        try:
            for i in range(count):
                yield np.full((2, 2, 3), i, dtype=np.uint8)
        finally:
            self.closed += 1


class FakeFaces(FaceDetector):
    def __init__(self, error_at_frame: int | None = None) -> None:
        self.frames: list[int] = []
        self.error_at_frame = error_at_frame

    def detect(self, frame: Frame) -> list[FaceBox]:
        index = int(frame[0, 0, 0])
        if index == self.error_at_frame:
            raise ReframeError("Model deteksi wajah gagal diunduh: offline")
        self.frames.append(index)
        # Wajah bergerak ke kanan; satu kotak keluar tepi kiri (dipotong), satu di luar frame.
        return [
            FaceBox(0.1 + index / 100, 0.2, 0.1, 0.15, 0.9),
            FaceBox(-0.05, 0.5, 0.1, 0.1, 0.7),
            FaceBox(1.2, 0.5, 0.1, 0.1, 0.7),
        ]


class FakeSession(SceneCutSession):
    def __init__(self, cuts: list[int]) -> None:
        self.cuts = cuts
        self.pushed = 0

    def push(self, frame: Frame) -> None:
        self.pushed += 1

    def finish(self) -> list[int]:
        return self.cuts


class FakeScenes(SceneCutDetector):
    def __init__(self, cuts: list[int]) -> None:
        self.cuts = cuts
        self.sessions: list[tuple[float, FakeSession]] = []

    def start(self, fps: float) -> SceneCutSession:
        session = FakeSession(self.cuts)
        self.sessions.append((fps, session))
        return session


def job(*clip_ids: str) -> Job:
    return Job(
        id="j1",
        project_id="p1",
        type="reframe",
        status="running",
        progress=0,
        payload={"clipIds": list(clip_ids)},
        attempts=1,
    )


def test_samples_faces_at_5_fps_and_scene_cuts_from_every_frame() -> None:
    repository = FakeRepository(video())
    frames, faces, scenes = FakeFrames(), FakeFaces(), FakeScenes([9])
    progress: list[float] = []

    result = AnalyzeReframeJob(repository, frames, faces, scenes)(job("c1"), progress.append)

    assert frames.requests == [("media/p1/proxy.mp4", 10_000, 11_000, 15, (640, 360))]
    [(fps, session)] = scenes.sessions
    assert (fps, session.pushed) == (15, 15)
    # Frame 0, 3, 6, 9, 12 → 5 sampel dalam 1 dtk.
    assert faces.frames == [0, 3, 6, 9, 12]
    version, analysis, crop_version, crops = repository.saved["c1"]
    assert (version, crop_version) == (ANALYSIS_VERSION, CROP_VERSION)
    assert set(crops) == {"9:16", "1:1", "16:9"}
    assert crops["9:16"] and crops["16:9"] == []  # sumber 16:9 → 16:9 tanpa crop
    assert (analysis.start_ms, analysis.end_ms, analysis.width, analysis.height) == (
        10_000,
        11_000,
        1920,
        1080,
    )
    assert [s.t_ms for s in analysis.samples] == [10_000, 10_200, 10_400, 10_600, 10_800]
    # Kotak di luar frame dibuang, yang melewati tepi dipotong.
    sample = analysis.samples[1]
    assert sample.t_ms == 10_200
    assert [(f.x, f.y, f.width, f.height, f.score) for f in sample.faces] == [
        pytest.approx((0.13, 0.2, 0.1, 0.15, 0.9)),
        pytest.approx((0.0, 0.5, 0.05, 0.1, 0.7)),
    ]
    assert analysis.scene_cuts_ms == (10_600,)
    assert progress == sorted(progress)
    assert progress[-1] == 100
    assert frames.closed == 1
    assert result == {
        "analyzedClipIds": ["c1"],
        "recroppedClipIds": [],
        "skippedClipIds": [],
        "missingClipIds": [],
    }


def test_skips_current_and_missing_clips_and_deduplicates_ids() -> None:
    repository = FakeRepository(video("c1"), video("c2"), video("c3"))
    repository.stored_rows["c2"] = StoredReframe(
        ANALYSIS_VERSION, stored_analysis(video("c2")), CROP_VERSION
    )
    repository.deleted_before_save.add("c3")
    frames = FakeFrames()

    result = AnalyzeReframeJob(repository, frames, FakeFaces(), FakeScenes([]))(
        job("c1", "c2", "hilang", "c1", "c3"), lambda _: None
    )

    assert len(frames.requests) == 2  # c1 & c3; c2 masih berlaku
    assert set(repository.saved) == {"c1"}
    assert result == {
        "analyzedClipIds": ["c1"],
        "recroppedClipIds": [],
        "skippedClipIds": ["c2"],
        "missingClipIds": ["hilang", "c3"],
    }


@pytest.mark.parametrize(
    ("stored", "detected"),
    [
        # Hanya algoritma crop yang berubah → crop dihitung dari analisis tersimpan.
        (StoredReframe(ANALYSIS_VERSION, stored_analysis(video()), CROP_VERSION - 1), False),
        (StoredReframe(ANALYSIS_VERSION, stored_analysis(video()), None), False),
        # Algoritma deteksi berubah atau rentang klip berbeda → deteksi ulang.
        (StoredReframe(ANALYSIS_VERSION - 1, stored_analysis(video()), CROP_VERSION), True),
        (StoredReframe(ANALYSIS_VERSION, stored_analysis(video(end_ms=12_000)), None), True),
    ],
)
def test_recrops_without_detection_only_when_analysis_still_valid(
    stored: StoredReframe, detected: bool
) -> None:
    repository = FakeRepository(video())
    repository.stored_rows["c1"] = stored
    frames = FakeFrames()

    result = AnalyzeReframeJob(repository, frames, FakeFaces(), FakeScenes([]))(
        job("c1"), lambda _: None
    )

    assert bool(frames.requests) == detected
    status = "analyzedClipIds" if detected else "recroppedClipIds"
    assert result[status] == ["c1"]
    _, analysis, crop_version, crops = repository.saved["c1"]
    assert crop_version == CROP_VERSION
    assert (analysis is stored.analysis) == (not detected)
    # Crop dari analisis tersimpan (wajah diam di tengah) atau dari deteksi baru (wajah palsu di
    # kiri, x ±0,1–0,2).
    expected_x = 0.0 if detected else 0.5 - 0.3164 / 2
    assert crops["9:16"][0].rect.x == pytest.approx(expected_x, abs=1e-3)


def test_one_failed_clip_does_not_stop_others_but_fails_job() -> None:
    broken = ClipVideo("c1", 0, 1_000, "media/p1/rusak.mp4", 1920, 1080)
    repository = FakeRepository(broken, video("c2"))

    with pytest.raises(JobFailure, match=r"gagal untuk 1 dari 2 klip: ffmpeg gagal"):
        AnalyzeReframeJob(
            repository, FakeFrames(fail_paths=("media/p1/rusak.mp4",)), FakeFaces(), FakeScenes([])
        )(job("c1", "c2"), lambda _: None)

    assert set(repository.saved) == {"c2"}


def test_detector_error_stops_frame_reading() -> None:
    frames = FakeFrames()

    with pytest.raises(JobFailure, match="Model deteksi wajah gagal diunduh"):
        AnalyzeReframeJob(
            FakeRepository(video()), frames, FakeFaces(error_at_frame=3), FakeScenes([])
        )(job("c1"), lambda _: None)

    assert frames.closed == 1


@pytest.mark.parametrize(
    ("clip", "message"),
    [
        (ClipVideo("c1", 0, 1_000, "media/p1/source.mp4", None, None), "belum selesai disiapkan"),
        (video(start_ms=5_000, end_ms=5_000), "Rentang klip kosong"),
        (video(start_ms=5_000, end_ms=5_010), "Tidak ada frame"),
    ],
)
def test_unanalyzable_clip_fails_with_message(clip: ClipVideo, message: str) -> None:
    with pytest.raises(JobFailure, match=message):
        AnalyzeReframeJob(FakeRepository(clip), FakeFrames(), FakeFaces(), FakeScenes([]))(
            job("c1"), lambda _: None
        )


def test_rejects_empty_payload() -> None:
    with pytest.raises(ValueError, match="clipIds"):
        AnalyzeReframeJob(FakeRepository(), FakeFrames(), FakeFaces(), FakeScenes([]))(
            job(), lambda _: None
        )
