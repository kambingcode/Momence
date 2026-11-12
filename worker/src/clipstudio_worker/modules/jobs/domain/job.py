"""Aturan murni status & progres job; cermin dari web/src/modules/jobs/domain/job.ts."""

import math
from dataclasses import dataclass
from typing import Any, Literal, get_args

JobStatus = Literal["queued", "running", "done", "failed"]
JOB_STATUSES: tuple[JobStatus, ...] = get_args(JobStatus)

_TRANSITIONS: dict[JobStatus, frozenset[JobStatus]] = {
    "queued": frozenset({"running"}),
    "running": frozenset({"done", "failed"}),
    "done": frozenset(),
    # Retry memasukkan job gagal kembali ke antrean.
    "failed": frozenset({"queued"}),
}


@dataclass(frozen=True)
class Job:
    id: str
    project_id: str | None
    type: str
    status: JobStatus
    progress: int
    payload: Any
    attempts: int


# Job yang terputus karena worker berhenti mendadak diulang otomatis selama klaimnya (`attempts`)
# belum mencapai batas ini; job yang terus membuat worker mati tidak diulang tanpa akhir.
MAX_ATTEMPTS = 3
# Pesan galat disimpan & ditampilkan utuh di web; potong yang terlalu panjang (mis. log ffmpeg).
MAX_ERROR_LENGTH = 2000

INTERRUPTED_TOO_OFTEN = (
    f"Worker berhenti {MAX_ATTEMPTS} kali di tengah job ini, jadi job tidak diulang otomatis. "
    "Periksa log worker, lalu klik Coba lagi."
)


def can_transition(current: JobStatus, target: JobStatus) -> bool:
    return target in _TRANSITIONS[current]


def normalize_progress(value: float) -> int:
    """Progres disimpan sebagai bilangan bulat 0–100."""
    if not math.isfinite(value):
        return 0
    return min(100, max(0, round(value)))


def limit_error(message: str) -> str:
    """Pesan galat untuk pengguna: tanpa spasi di tepi, maksimal `MAX_ERROR_LENGTH` karakter."""
    text = message.strip() or "Job gagal tanpa pesan."
    if len(text) <= MAX_ERROR_LENGTH:
        return text
    return text[: MAX_ERROR_LENGTH - 1].rstrip() + "…"
