from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from clipstudio_worker.modules.jobs.domain.job import Job


@dataclass(frozen=True)
class InterruptedJobs:
    """Job `running` yang ditinggalkan worker yang berhenti mendadak."""

    requeued: Sequence[Job]
    # Sudah `max_attempts` kali diklaim → `failed`.
    failed: Sequence[Job]


class JobRepository(Protocol):
    def claim_next(self, types: Collection[str]) -> Job | None:
        """Ambil job `queued` tertua dari `types` & tandai `running` secara atomik."""
        ...

    def update_progress(self, job_id: str, progress: int) -> None: ...

    def complete(self, job_id: str, result: Mapping[str, Any]) -> None: ...

    def fail(self, job_id: str, error: str) -> None: ...

    def enqueue(self, job_type: str, project_id: str | None, payload: Mapping[str, Any]) -> Job:
        """Antre job lanjutan. Bila job dengan tipe, proyek & payload yang sama masih `queued` /
        `running`, job itu yang dikembalikan (job yang diulang tidak mengantre lanjutan ganda)."""
        ...

    def requeue_interrupted(self, max_attempts: int, error: str) -> InterruptedJobs:
        """Semua job `running` → `queued` (diulang dari awal), kecuali yang sudah `max_attempts`
        kali diklaim → `failed` dengan `error`. Hanya aman bila tidak ada worker lain berjalan."""
        ...
