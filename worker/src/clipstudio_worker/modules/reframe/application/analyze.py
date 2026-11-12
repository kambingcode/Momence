from collections.abc import Callable, Mapping
from contextlib import closing
from typing import Any

from clipstudio_worker.modules.jobs.application import Job, JobFailure, ReportProgress
from clipstudio_worker.modules.reframe.application.payloads import ReframePayload
from clipstudio_worker.modules.reframe.application.ports import (
    ClipVideo,
    FaceDetector,
    FrameReader,
    ReframeError,
    ReframeRepository,
    SceneCutDetector,
    StoredReframe,
)
from clipstudio_worker.modules.reframe.domain.analysis import (
    ANALYSIS_VERSION,
    FACE_STRIDE,
    FRAME_FPS,
    ClipAnalysis,
    FaceSample,
    analysis_size,
    clamp_box,
    expected_frames,
    frame_time_ms,
    scene_cuts_ms,
)
from clipstudio_worker.modules.reframe.domain.crop import CROP_VERSION, crop_tracks


def _reusable(stored: StoredReframe | None, video: ClipVideo) -> ClipAnalysis | None:
    """Analisis tersimpan yang masih berlaku untuk rentang klip & versi deteksi sekarang."""
    if stored is None or stored.version != ANALYSIS_VERSION:
        return None
    analysis = stored.analysis
    if (analysis.start_ms, analysis.end_ms) != (video.start_ms, video.end_ms):
        return None
    return analysis


class AnalyzeReframeJob:
    """Untuk tiap klip: baca frame 15 fps dari proxy, catat batas adegan dari semua frame dan
    wajah dari setiap frame ke-3 (5 fps), hitung jalur crop tiap rasio, lalu simpan.

    Idempoten: klip yang analisis & crop-nya masih berlaku dilewati; bila hanya algoritma crop
    yang berubah, crop dihitung ulang dari analisis tersimpan tanpa deteksi ulang. Klip yang
    sudah dihapus diabaikan. Satu klip gagal tidak menghentikan klip lain; job gagal di akhir
    bila ada yang gagal (menjalankan ulang hanya mengerjakan sisanya).
    """

    def __init__(
        self,
        repository: ReframeRepository,
        frames: FrameReader,
        faces: FaceDetector,
        scenes: SceneCutDetector,
    ) -> None:
        self._repository = repository
        self._frames = frames
        self._faces = faces
        self._scenes = scenes

    def __call__(self, job: Job, report_progress: ReportProgress) -> Mapping[str, Any]:
        payload = ReframePayload.model_validate(job.payload)
        clip_ids = list(dict.fromkeys(payload.clip_ids))
        outcome: dict[str, list[str]] = {
            "analyzedClipIds": [],
            "recroppedClipIds": [],
            "skippedClipIds": [],
            "missingClipIds": [],
        }
        failures: list[str] = []
        span = 100 / len(clip_ids)
        for number, clip_id in enumerate(clip_ids):
            base = number * span
            video = self._repository.clip_video(clip_id)
            if video is None:
                outcome["missingClipIds"].append(clip_id)
                continue
            stored = self._repository.stored(clip_id)
            analysis = _reusable(stored, video)
            if analysis is not None and stored and stored.crop_version == CROP_VERSION:
                outcome["skippedClipIds"].append(clip_id)
                continue
            status = "recroppedClipIds"
            if analysis is None:
                status = "analyzedClipIds"
                try:
                    analysis = self._analyze(
                        video, lambda f, base=base: report_progress(base + f * span)
                    )
                except ReframeError as exc:
                    failures.append(str(exc))
                    continue
            saved = self._repository.save(
                clip_id, ANALYSIS_VERSION, analysis, CROP_VERSION, crop_tracks(analysis)
            )
            outcome[status if saved else "missingClipIds"].append(clip_id)
        if failures:
            raise JobFailure(
                f"Analisis gagal untuk {len(failures)} dari {len(clip_ids)} klip: {failures[0]}"
            )
        return outcome

    def _analyze(self, video: ClipVideo, on_progress: Callable[[float], None]) -> ClipAnalysis:
        if not video.width or not video.height:
            raise ReframeError("Video sumber belum selesai disiapkan (ingest).")
        if video.end_ms <= video.start_ms:
            raise ReframeError("Rentang klip kosong.")
        total = expected_frames(video.start_ms, video.end_ms)
        session = self._scenes.start(FRAME_FPS)
        samples: list[FaceSample] = []
        count = 0
        frames = self._frames.read(
            video.video_path,
            video.start_ms,
            video.end_ms,
            FRAME_FPS,
            analysis_size(video.width, video.height),
        )
        # Detektor gagal di tengah → pembacaan frame (subproses) ikut dihentikan.
        with closing(frames):
            for index, frame in enumerate(frames):
                session.push(frame)
                if index % FACE_STRIDE == 0:
                    boxes = (clamp_box(box) for box in self._faces.detect(frame))
                    faces = tuple(box for box in boxes if box is not None)
                    samples.append(FaceSample(frame_time_ms(video.start_ms, index), faces))
                count = index + 1
                on_progress(min(1.0, count / total))
        if count == 0:
            raise ReframeError("Tidak ada frame yang terbaca dari video klip.")
        return ClipAnalysis(
            start_ms=video.start_ms,
            end_ms=video.end_ms,
            width=video.width,
            height=video.height,
            samples=tuple(samples),
            scene_cuts_ms=scene_cuts_ms(video.start_ms, video.end_ms, session.finish()),
        )
