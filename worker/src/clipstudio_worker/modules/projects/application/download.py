from collections.abc import Mapping
from typing import Any

from clipstudio_worker.modules.jobs.application import (
    Job,
    JobFailure,
    JobRepository,
    ReportProgress,
)
from clipstudio_worker.modules.projects.application.payloads import (
    DownloadPayload,
    IngestPayload,
)
from clipstudio_worker.modules.projects.application.ports import (
    SourceRepository,
    VideoDownloader,
)
from clipstudio_worker.modules.projects.domain.download import (
    VideoDownloadError,
    project_name_from_title,
)

# Sisa 1% = simpan metadata & antre ingest.
_DOWNLOAD_END = 99


class DownloadVideoJob:
    """Unduh video sumber dari link ke `sources.path`, beri nama proyek = judul, lalu antre
    `ingest`.

    Idempoten: dijalankan ulang akan mengunduh ulang dan menimpa file yang sama.
    """

    def __init__(
        self, sources: SourceRepository, downloader: VideoDownloader, jobs: JobRepository
    ) -> None:
        self._sources = sources
        self._downloader = downloader
        self._jobs = jobs

    def __call__(self, job: Job, report_progress: ReportProgress) -> Mapping[str, Any]:
        payload = DownloadPayload.model_validate(job.payload)
        source = self._sources.get(payload.source_id)
        if source is None:
            raise JobFailure("Video sumber tidak ditemukan (proyek mungkin sudah dihapus).")

        try:
            video = self._downloader.download(
                payload.url,
                source.path,
                lambda f: report_progress(f * _DOWNLOAD_END),
                payload.max_resolution,
            )
        except VideoDownloadError as exc:
            raise JobFailure(str(exc)) from exc
        if video.size_bytes <= 0:
            raise JobFailure("Video yang diunduh kosong.")

        name = project_name_from_title(video.title, fallback=payload.url)
        self._sources.save_download(source.id, video.size_bytes, name)
        next_payload = IngestPayload.model_validate(
            {"sourceId": source.id, "audioReady": payload.audio_first}
        ).model_dump(by_alias=True, exclude_defaults=True)
        ingest = self._jobs.enqueue("ingest", source.project_id, next_payload)
        return {
            "title": video.title,
            "sizeBytes": video.size_bytes,
            "maxResolution": payload.max_resolution,
            "ingestJobId": ingest.id,
        }
