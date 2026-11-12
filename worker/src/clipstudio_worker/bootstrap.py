"""Composition root: satu-satunya tempat adapter dipasangkan ke port (application)."""

import logging
import sys
import time
from collections.abc import Sequence
from dataclasses import dataclass
from typing import IO

import structlog
from sqlalchemy import inspect

from clipstudio_worker.config import ConfigError, WorkerConfig, load_config
from clipstudio_worker.db import create_sqlite_engine
from clipstudio_worker.lock import WorkerLockedError, acquire_worker_lock
from clipstudio_worker.modules.broll.application import PlanBrollJob
from clipstudio_worker.modules.broll.infrastructure.gemini_broll_planner import (
    GeminiBrollPlanner,
)
from clipstudio_worker.modules.clips.application import DiscoverClipsJob
from clipstudio_worker.modules.clips.infrastructure.gemini_clip_suggester import (
    GeminiClipSuggester,
)
from clipstudio_worker.modules.clips.infrastructure.sqlalchemy_clip_focus import (
    SqlAlchemyClipFocus,
)
from clipstudio_worker.modules.clips.infrastructure.sqlalchemy_clip_repository import (
    SqlAlchemyClipRepository,
)
from clipstudio_worker.modules.clips.infrastructure.sqlalchemy_proxy_readiness import (
    SqlAlchemyProxyReadiness,
)
from clipstudio_worker.modules.jobs.application import JobRunner, NoopJob
from clipstudio_worker.modules.jobs.infrastructure.sqlalchemy_job_repository import (
    SqlAlchemyJobRepository,
)
from clipstudio_worker.modules.projects.application import (
    BackfillThumbnails,
    CleanMedia,
    DownloadAudioJob,
    DownloadVideoJob,
    IngestJob,
)
from clipstudio_worker.modules.projects.infrastructure.ffmpeg_media_processor import (
    FfmpegMediaProcessor,
)
from clipstudio_worker.modules.projects.infrastructure.local_media_folder import LocalMediaFolder
from clipstudio_worker.modules.projects.infrastructure.sqlalchemy_project_index import (
    SqlAlchemyProjectIndex,
)
from clipstudio_worker.modules.projects.infrastructure.sqlalchemy_source_repository import (
    SqlAlchemySourceRepository,
)
from clipstudio_worker.modules.projects.infrastructure.yt_dlp_video_downloader import (
    YtDlpVideoDownloader,
)
from clipstudio_worker.modules.reframe.application import AnalyzeReframeJob
from clipstudio_worker.modules.reframe.infrastructure.ffmpeg_frame_reader import FfmpegFrameReader
from clipstudio_worker.modules.reframe.infrastructure.mediapipe_face_detector import (
    MediaPipeFaceDetector,
)
from clipstudio_worker.modules.reframe.infrastructure.pyscenedetect_cut_detector import (
    PySceneDetectCutDetector,
)
from clipstudio_worker.modules.reframe.infrastructure.sqlalchemy_reframe_repository import (
    SqlAlchemyReframeRepository,
)
from clipstudio_worker.modules.render.application import RenderClipJob
from clipstudio_worker.modules.render.infrastructure.local_render_files import LocalRenderFiles
from clipstudio_worker.modules.render.infrastructure.remotion_cli_renderer import (
    RemotionCliRenderer,
)
from clipstudio_worker.modules.render.infrastructure.sqlalchemy_render_history import (
    SqlAlchemyRenderHistory,
)
from clipstudio_worker.modules.settings.application import CurrentSettings, ReportWorkerStatus
from clipstudio_worker.modules.settings.infrastructure.sqlalchemy_settings_repository import (
    SqlAlchemySettingsRepository,
)
from clipstudio_worker.modules.social.application import WritePostCopyJob
from clipstudio_worker.modules.social.infrastructure.gemini_post_copy_writer import (
    GeminiPostCopyWriter,
)
from clipstudio_worker.modules.transcript.application import TranscribeJob
from clipstudio_worker.modules.transcript.infrastructure.local_audio_cache import LocalAudioCache
from clipstudio_worker.modules.transcript.infrastructure.mlx_whisper_transcriber import (
    MlxWhisperTranscriber,
)
from clipstudio_worker.modules.transcript.infrastructure.silero_voice_activity_detector import (
    SileroVoiceActivityDetector,
)
from clipstudio_worker.modules.transcript.infrastructure.sqlalchemy_transcript_repository import (
    SqlAlchemyTranscriptRepository,
)


class SetupError(RuntimeError):
    """Lingkungan belum siap (mis. database belum dibuat oleh web)."""


@dataclass(frozen=True)
class Container:
    config: WorkerConfig
    # Lane utama (thread utama): semua job kecuali yang di lane latar.
    job_runner: JobRunner
    # Lane latar (nama, runner): jalan bersamaan dengan lane utama, tiap lane satu job.
    background_runners: Sequence[tuple[str, JobRunner]]
    worker_status: ReportWorkerStatus
    # Bersih-bersih folder media saat worker mulai.
    clean_media: CleanMedia
    # Thumbnail untuk proyek yang di-ingest sebelum fitur thumbnail ada.
    backfill_thumbnails: BackfillThumbnails
    # Kunci satu-worker; dilepas saat proses berakhir.
    lock: IO[str]


# Lane latar: unduhan & ffmpeg tidak boleh menunggu job berat di lane utama (dan sebaliknya).
# `download-audio` punya lane sendiri agar transkripsi bisa mulai dalam detik walau video lain
# sedang diunduh. Tipe selain ini jalan di lane utama (Whisper & MediaPipe harus satu thread).
BACKGROUND_LANES: dict[str, tuple[str, ...]] = {
    "audio": ("download-audio",),
    "video": ("download", "ingest"),
}


def configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="%H:%M:%S", utc=False),
            structlog.dev.ConsoleRenderer(
                colors=sys.stdout.isatty(),
                # Tanpa variabel lokal: frame SDK bisa memuat API key.
                exception_formatter=structlog.dev.RichTracebackFormatter(show_locals=False),
            ),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    )


def build_container(config: WorkerConfig | None = None) -> Container:
    try:
        config = config or load_config()
    except ConfigError as exc:
        raise SetupError(str(exc)) from exc
    # Skema & migrasi milik web; worker tidak membuat DB sendiri.
    if not config.database_path.exists():
        raise SetupError(
            f"Database belum ada di {config.database_path}. "
            "Jalankan web sekali (`npm run dev`) atau `npm run db:migrate` di web/."
        )
    engine = create_sqlite_engine(config.database_path)
    if not inspect(engine).has_table("jobs"):
        raise SetupError("Tabel `jobs` belum ada. Jalankan `npm run db:migrate` di web/.")

    if not inspect(engine).has_table("settings"):
        raise SetupError("Tabel `settings` belum ada. Jalankan `npm run db:migrate` di web/.")

    lock_path = config.data_dir / "worker.lock"
    try:
        lock = acquire_worker_lock(lock_path)
    except WorkerLockedError as exc:
        raise SetupError(
            f"Worker lain sudah berjalan untuk data ini ({lock_path}). Hentikan worker itu dulu."
        ) from exc

    settings_repository = SqlAlchemySettingsRepository(engine)
    settings = CurrentSettings(settings_repository, config.gemini_model)
    jobs = SqlAlchemyJobRepository(engine)
    sources = SqlAlchemySourceRepository(engine)
    transcripts = SqlAlchemyTranscriptRepository(engine)
    media = FfmpegMediaProcessor(config.data_dir)
    downloader = YtDlpVideoDownloader(
        config.data_dir, config.node, concurrent_fragments=config.download_concurrency
    )
    handlers = {
        "noop": NoopJob(sleep=time.sleep),
        "download": DownloadVideoJob(sources, downloader, jobs),
        "download-audio": DownloadAudioJob(sources, downloader, media, jobs),
        "ingest": IngestJob(sources, media, media, jobs, sources),
        "transcribe": TranscribeJob(
            sources,
            transcripts,
            SileroVoiceActivityDetector(config.data_dir),
            MlxWhisperTranscriber(config.data_dir, config.whisper_model),
            jobs,
            filler_words=settings.filler_words,
            audio=LocalAudioCache(config.data_dir, media),
        ),
        "discover": DiscoverClipsJob(
            transcripts,
            GeminiClipSuggester(settings.gemini_model, config.gemini_api_key),
            SqlAlchemyClipRepository(engine),
            jobs,
            SqlAlchemyClipFocus(engine),
            concurrency=config.discover_concurrency,
            proxies=SqlAlchemyProxyReadiness(engine),
        ),
        "reframe": AnalyzeReframeJob(
            SqlAlchemyReframeRepository(engine),
            FfmpegFrameReader(config.data_dir),
            MediaPipeFaceDetector(config.data_dir / "models"),
            PySceneDetectCutDetector(),
        ),
        "render": RenderClipJob(
            RemotionCliRenderer(config.data_dir, config.web_dir, config.node),
            SqlAlchemyRenderHistory(engine),
            LocalRenderFiles(config.data_dir),
        ),
        "broll-plan": PlanBrollJob(
            GeminiBrollPlanner(settings.gemini_model, config.gemini_api_key)
        ),
        "post-copy": WritePostCopyJob(
            GeminiPostCopyWriter(settings.gemini_model, config.gemini_api_key)
        ),
    }
    worker_status = ReportWorkerStatus(
        settings_repository,
        gemini_api_key=config.gemini_api_key is not None,
        gemini_model=config.gemini_model,
        whisper_model=config.whisper_model,
        now=lambda: time.time_ns() // 1_000_000,
    )
    background_types = {t for types in BACKGROUND_LANES.values() for t in types}
    main_handlers = {t: h for t, h in handlers.items() if t not in background_types}
    return Container(
        config=config,
        job_runner=JobRunner(jobs, main_handlers),
        background_runners=[
            (name, JobRunner(jobs, {t: handlers[t] for t in types}))
            for name, types in BACKGROUND_LANES.items()
        ],
        worker_status=worker_status,
        clean_media=CleanMedia(
            SqlAlchemyProjectIndex(engine),
            LocalMediaFolder(config.data_dir),
            now=lambda: time.time_ns() // 1_000_000,
        ),
        backfill_thumbnails=BackfillThumbnails(sources, LocalMediaFolder(config.data_dir), media),
        lock=lock,
    )
