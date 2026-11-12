from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from pydantic import ValidationError

from clipstudio_worker.modules.jobs.application.ports import InterruptedJobs, JobRepository
from clipstudio_worker.modules.jobs.domain.job import (
    INTERRUPTED_TOO_OFTEN,
    MAX_ATTEMPTS,
    Job,
    limit_error,
    normalize_progress,
)

ReportProgress = Callable[[float], None]


class JobFailure(Exception):
    """Kegagalan yang sudah diantisipasi; pesannya ditampilkan apa adanya ke pengguna."""


class JobHandler(Protocol):
    """Satu tipe job = satu handler (use case di modulnya). Mengembalikan hasil (JSON)."""

    def __call__(self, job: Job, report_progress: ReportProgress, /) -> Mapping[str, Any]: ...


@dataclass(frozen=True)
class JobOutcome:
    job: Job
    status: Literal["done", "failed"]
    error: str | None = None
    # Galat tak terduga (bukan `JobFailure`): traceback-nya dicatat di log worker.
    exception: Exception | None = None


def unexpected_error_message(exc: Exception) -> str:
    """Pesan untuk pengguna dari galat yang tidak diantisipasi handler."""
    if isinstance(exc, ValidationError):
        detail = ""
        if errors := exc.errors():
            where = ".".join(str(part) for part in errors[0]["loc"])
            detail = f" ({where}: {errors[0]['msg']})" if where else f" ({errors[0]['msg']})"
        return f"Data job tidak valid{detail}. Versi web & worker mungkin berbeda."
    return f"Galat tak terduga di worker — {type(exc).__name__}: {exc}. Detail ada di log worker."


class JobRunner:
    def __init__(self, jobs: JobRepository, handlers: Mapping[str, JobHandler]) -> None:
        self._jobs = jobs
        self._handlers = handlers

    def recover_interrupted(self) -> InterruptedJobs:
        """Saat worker mulai: ulang job yang terputus karena worker sebelumnya berhenti mendadak."""
        return self._jobs.requeue_interrupted(MAX_ATTEMPTS, INTERRUPTED_TOO_OFTEN)

    def claim_next(self) -> Job | None:
        # Hanya tipe yang punya handler; tipe lain (mis. dari kartu yang belum dibuat) tetap antre.
        return self._jobs.claim_next(self._handlers.keys())

    def run(self, job: Job) -> JobOutcome:
        handler = self._handlers.get(job.type)
        if handler is None:
            return self._fail(job, f"Tipe job tidak dikenal: {job.type}")

        last_progress = job.progress

        def report_progress(value: float) -> None:
            # Tulis ke DB hanya bila angka bulatnya berubah.
            nonlocal last_progress
            progress = normalize_progress(value)
            if progress != last_progress:
                last_progress = progress
                self._jobs.update_progress(job.id, progress)

        try:
            result = handler(job, report_progress)
        except JobFailure as exc:
            return self._fail(job, str(exc))
        except Exception as exc:
            # Error tak terduga: sertakan nama tipe agar mudah ditelusuri.
            return self._fail(job, unexpected_error_message(exc), exc)
        self._jobs.complete(job.id, result)
        return JobOutcome(job=job, status="done")

    def _fail(self, job: Job, error: str, exception: Exception | None = None) -> JobOutcome:
        message = limit_error(error)
        self._jobs.fail(job.id, message)
        return JobOutcome(job=job, status="failed", error=message, exception=exception)
