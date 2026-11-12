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
    DownloadAudioPayload,
    TranscribePayload,
)
from clipstudio_worker.modules.projects.application.ports import (
    AudioDownloader,
    MediaProcessor,
    SourceRepository,
)
from clipstudio_worker.modules.projects.domain.download import (
    VideoDownloadError,
    project_name_from_title,
)
from clipstudio_worker.modules.projects.domain.media import UnsupportedMediaError

# Sisa 1% = simpan metadata & antre transcribe.
_DOWNLOAD_END = 99


class DownloadAudioJob:
    """Unduh hanya suara video dari link (puluhan MB, detik–menit) ke `audio.wav`, simpan
    durasinya, lalu langsung antre `transcribe` — transkripsi & pencarian klip berjalan selagi
    video penuh masih diunduh oleh job `download`.

    Idempoten: dijalankan ulang akan mengunduh ulang dan menimpa audio yang sama.
    """

    def __init__(
        self,
        sources: SourceRepository,
        downloader: AudioDownloader,
        media: MediaProcessor,
        jobs: JobRepository,
    ) -> None:
        self._sources = sources
        self._downloader = downloader
        self._media = media
        self._jobs = jobs

    def __call__(self, job: Job, report_progress: ReportProgress) -> Mapping[str, Any]:
        payload = DownloadAudioPayload.model_validate(job.payload)
        source = self._sources.get(payload.source_id)
        if source is None:
            raise JobFailure("Video sumber tidak ditemukan (proyek mungkin sudah dihapus).")

        audio_path = posixpath.join(posixpath.dirname(source.path), "audio.wav")
        try:
            audio = self._downloader.download_audio(
                payload.url, audio_path, lambda f: report_progress(f * _DOWNLOAD_END)
            )
            duration_ms = self._media.audio_duration_ms(audio_path)
        except (VideoDownloadError, UnsupportedMediaError) as exc:
            raise JobFailure(str(exc)) from exc
        if duration_ms <= 0:
            raise JobFailure("Durasi audio tidak terbaca.")

        name = project_name_from_title(audio.title, fallback=payload.url)
        self._sources.save_audio(source.id, duration_ms, audio_path, name)
        next_payload = TranscribePayload.model_validate({"sourceId": source.id}).model_dump(
            by_alias=True
        )
        transcribe = self._jobs.enqueue("transcribe", source.project_id, next_payload)
        return {
            "title": audio.title,
            "durationMs": duration_ms,
            "audioPath": audio_path,
            "transcribeJobId": transcribe.id,
        }
