from collections.abc import Collection, Mapping
from dataclasses import replace
from typing import Any

from clipstudio_worker.modules.jobs.application import InterruptedJobs, Job, JobRepository


class InMemoryJobRepository(JobRepository):
    """Fake adapter untuk unit test use case (tanpa DB)."""

    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        self.results: dict[str, Mapping[str, Any]] = {}
        self.errors: dict[str, str] = {}
        self.progress_writes: list[tuple[str, int]] = []

    def claim_next(self, types: Collection[str]) -> Job | None:
        for job in self.jobs.values():
            if job.status == "queued" and job.type in types:
                claimed = replace(job, status="running", attempts=job.attempts + 1)
                self.jobs[job.id] = claimed
                return claimed
        return None

    def update_progress(self, job_id: str, progress: int) -> None:
        self.progress_writes.append((job_id, progress))
        self.jobs[job_id] = replace(self.jobs[job_id], progress=progress)

    def complete(self, job_id: str, result: Mapping[str, Any]) -> None:
        self.results[job_id] = result
        self.jobs[job_id] = replace(self.jobs[job_id], status="done", progress=100)

    def fail(self, job_id: str, error: str) -> None:
        self.errors[job_id] = error
        self.jobs[job_id] = replace(self.jobs[job_id], status="failed")

    def enqueue(self, job_type: str, project_id: str | None, payload: Mapping[str, Any]) -> Job:
        for pending in self.jobs.values():
            if (pending.type, pending.project_id, pending.payload) == (
                job_type,
                project_id,
                dict(payload),
            ) and pending.status in ("queued", "running"):
                return pending
        job = Job(
            id=f"job-{len(self.jobs) + 1}",
            project_id=project_id,
            type=job_type,
            status="queued",
            progress=0,
            payload=dict(payload),
            attempts=0,
        )
        self.jobs[job.id] = job
        return job

    def requeue_interrupted(self, max_attempts: int, error: str) -> InterruptedJobs:
        requeued: list[Job] = []
        failed: list[Job] = []
        for job in [j for j in self.jobs.values() if j.status == "running"]:
            if job.attempts < max_attempts:
                requeued.append(replace(job, status="queued", progress=0))
                self.jobs[job.id] = requeued[-1]
            else:
                self.errors[job.id] = error
                failed.append(replace(job, status="failed"))
                self.jobs[job.id] = failed[-1]
        return InterruptedJobs(requeued=requeued, failed=failed)
