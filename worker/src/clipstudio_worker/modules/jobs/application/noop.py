from collections.abc import Callable, Mapping
from typing import Any

from clipstudio_worker.modules.jobs.application.payloads import NoopPayload
from clipstudio_worker.modules.jobs.application.runner import ReportProgress
from clipstudio_worker.modules.jobs.domain.job import Job

STEPS = 10


class NoopJob:
    """Job uji: menunggu `durationMs` dalam 10 langkah sambil melaporkan progres."""

    def __init__(self, sleep: Callable[[float], None]) -> None:
        self._sleep = sleep

    def __call__(self, job: Job, report_progress: ReportProgress) -> Mapping[str, Any]:
        payload = NoopPayload.model_validate(job.payload)
        for step in range(1, STEPS + 1):
            self._sleep(payload.duration_ms / 1000 / STEPS)
            report_progress(step * 100 / STEPS)
        return {"sleptMs": payload.duration_ms}
