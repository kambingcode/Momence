import posixpath
from collections.abc import Mapping
from typing import Any

from clipstudio_worker.modules.jobs.application import (
    Job,
    JobFailure,
    JobRepository,
    ReportProgress,
)
from clipstudio_worker.modules.projects.application.payloads import (
    IngestPayload,
    TranscribePayload,
)
from clipstudio_worker.modules.projects.application.ports import (
    MediaProcessor,
    SourceClips,
    SourceRepository,
    ThumbnailMaker,
)
from clipstudio_worker.modules.projects.application.thumbnails import make_thumbnail
from clipstudio_worker.modules.projects.domain.media import (
    UnsupportedMediaError,
    proxy_frame_rate,
    proxy_size,
)
from clipstudio_worker.modules.reframe.application import ReframePayload

# Bobot progres per langkah (total 100): tanpa audio sendiri, proxy mendapat jatah audio.
_PROBE_END = 5
_AUDIO_END = 35
_PROXY_END = 95


class IngestJob:
    """Probe video sumber, ekstrak audio (bila belum ada) lalu langsung antre `transcribe`,
    buat proxy & thumbnail, simpan metadata, dan antre `reframe` bila klipnya sudah ditemukan.

    Transkripsi diantre sebelum proxy dibuat, sehingga keduanya berjalan bersamaan (proxy di jalur
    video, transkripsi di jalur utama worker). Karena itu discover bisa selesai lebih dulu dari
    proxy; yang selesai belakangan yang mengantre `reframe` (lihat `DiscoverClipsJob`).

    Audio dianggap sudah ada bila `audioReady` (diambil `download-audio`) atau sumber ini sudah
    pernah punya audio (ingest yang diulang tidak mengantre transkripsi lagi).
    Idempoten: dijalankan ulang akan menimpa proxy/thumbnail & metadata yang sama.
    """

    def __init__(
        self,
        sources: SourceRepository,
        media: MediaProcessor,
        thumbnails: ThumbnailMaker,
        jobs: JobRepository,
        clips: SourceClips | None = None,
    ) -> None:
        self._sources = sources
        self._media = media
        self._thumbnails = thumbnails
        self._jobs = jobs
        self._clips = clips

    def __call__(self, job: Job, report_progress: ReportProgress) -> Mapping[str, Any]:
        payload = IngestPayload.model_validate(job.payload)
        source = self._sources.get(payload.source_id)
        if source is None:
            raise JobFailure("Video sumber tidak ditemukan (proyek mungkin sudah dihapus).")
        audio_ready = payload.audio_ready or source.audio_path is not None

        try:
            info = self._media.probe(source.path)
            if not audio_ready and not info.has_audio:
                raise UnsupportedMediaError(
                    "Video tidak punya trek audio; transkripsi butuh suara."
                )
            if info.duration_ms <= 0:
                raise UnsupportedMediaError("Durasi video tidak terbaca.")
        except UnsupportedMediaError as exc:
            raise JobFailure(str(exc)) from exc
        report_progress(_PROBE_END)

        folder = posixpath.dirname(source.path)
        audio_path = source.audio_path or posixpath.join(folder, "audio.wav")
        proxy_path = posixpath.join(folder, "proxy.mp4")

        transcribe_id: str | None = None
        proxy_start = _PROBE_END
        if not audio_ready:
            self._media.extract_audio(
                source.path,
                audio_path,
                info.duration_ms,
                lambda f: report_progress(_PROBE_END + f * (_AUDIO_END - _PROBE_END)),
            )
            self._sources.save_audio(source.id, info.duration_ms, audio_path, None)
            transcribe_id = self._enqueue_transcribe(source.id, source.project_id)
            proxy_start = _AUDIO_END
        size = proxy_size(info.width, info.height)
        frame_rate = proxy_frame_rate(info.fps)
        self._media.make_proxy(
            source.path,
            proxy_path,
            size,
            frame_rate,
            info.duration_ms,
            lambda f: report_progress(proxy_start + f * (_PROXY_END - proxy_start)),
        )

        # Hiasan dashboard: gagal membuatnya tidak boleh menggagalkan ingest.
        thumbnail_path = make_thumbnail(self._thumbnails, proxy_path, info.duration_ms)
        report_progress(_PROXY_END)

        self._sources.save_media(source.id, info, audio_path, proxy_path)
        reframe_id = self._enqueue_reframe(source.id, source.project_id)
        return {
            "durationMs": info.duration_ms,
            "width": info.width,
            "height": info.height,
            "fps": info.fps,
            "audioPath": audio_path,
            "proxyPath": proxy_path,
            "proxySize": list(size),
            "proxyFps": frame_rate or info.fps,
            "thumbnailPath": thumbnail_path,
            "transcribeJobId": transcribe_id,
            "reframeJobId": reframe_id,
        }

    def _enqueue_transcribe(self, source_id: str, project_id: str) -> str:
        payload = TranscribePayload.model_validate({"sourceId": source_id}).model_dump(
            by_alias=True
        )
        return self._jobs.enqueue("transcribe", project_id, payload).id

    def _enqueue_reframe(self, source_id: str, project_id: str) -> str | None:
        """Discover yang selesai sebelum proxy ini siap tidak mengantre `reframe`; yang selesai
        belakangan mengantre (dua-duanya mengantre = aman, analisis yang berlaku dilewati)."""
        clip_ids = self._clips.clip_ids(source_id) if self._clips is not None else []
        if not clip_ids:
            return None
        payload = ReframePayload.model_validate({"clipIds": clip_ids}).model_dump(by_alias=True)
        return self._jobs.enqueue("reframe", project_id, payload).id
