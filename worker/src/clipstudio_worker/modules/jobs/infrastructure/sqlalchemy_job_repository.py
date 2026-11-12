import time
import uuid
from collections.abc import Callable, Collection, Mapping
from typing import Any

from sqlalchemy import Engine, Row, insert, select, update

from clipstudio_worker.modules.jobs.application import InterruptedJobs, Job, JobRepository
from clipstudio_worker.modules.jobs.domain.job import normalize_progress
from clipstudio_worker.modules.jobs.infrastructure.tables import jobs


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


def _to_job(row: Row[Any]) -> Job:
    m = row._mapping  # pyright: ignore[reportPrivateUsage]
    return Job(
        id=m["id"],
        project_id=m["project_id"],
        type=m["type"],
        status=m["status"],
        progress=m["progress"],
        payload=m["payload"],
        attempts=m["attempts"],
    )


class SqlAlchemyJobRepository(JobRepository):
    def __init__(self, engine: Engine, now: Callable[[], int] = _now_ms) -> None:
        self._engine = engine
        self._now = now

    def claim_next(self, types: Collection[str]) -> Job | None:
        if not types:
            return None
        now = self._now()
        oldest_queued = (
            select(jobs.c.id)
            .where(jobs.c.status == "queued", jobs.c.type.in_(list(types)))
            .order_by(jobs.c.created_at, jobs.c.id)
            .limit(1)
            .scalar_subquery()
        )
        # Satu statement UPDATE … RETURNING = atomik di SQLite; dua worker tidak bisa
        # mengklaim job yang sama karena syarat status == 'queued' dicek ulang saat menulis.
        stmt = (
            update(jobs)
            .where(jobs.c.id == oldest_queued, jobs.c.status == "queued")
            .values(
                status="running",
                progress=0,
                error=None,
                attempts=jobs.c.attempts + 1,
                started_at=now,
                finished_at=None,
                updated_at=now,
            )
            .returning(*jobs.c)
        )
        with self._engine.begin() as conn:
            row = conn.execute(stmt).first()
        return _to_job(row) if row else None

    def update_progress(self, job_id: str, progress: int) -> None:
        self._update_running(job_id, progress=normalize_progress(progress))

    def complete(self, job_id: str, result: Mapping[str, Any]) -> None:
        self._update_running(
            job_id, status="done", progress=100, result=dict(result), finished_at=self._now()
        )

    def fail(self, job_id: str, error: str) -> None:
        self._update_running(job_id, status="failed", error=error, finished_at=self._now())

    def enqueue(self, job_type: str, project_id: str | None, payload: Mapping[str, Any]) -> Job:
        now = self._now()
        pending = select(jobs).where(
            jobs.c.type == job_type,
            jobs.c.project_id.is_(None) if project_id is None else jobs.c.project_id == project_id,
            jobs.c.status.in_(["queued", "running"]),
        )
        stmt = (
            insert(jobs)
            .values(
                id=str(uuid.uuid4()),
                project_id=project_id,
                type=job_type,
                status="queued",
                progress=0,
                payload=dict(payload),
                attempts=0,
                created_at=now,
                updated_at=now,
            )
            .returning(*jobs.c)
        )
        with self._engine.begin() as conn:
            for existing in map(_to_job, conn.execute(pending)):
                if existing.payload == dict(payload):
                    return existing
            row = conn.execute(stmt).one()
        return _to_job(row)

    def requeue_interrupted(self, max_attempts: int, error: str) -> InterruptedJobs:
        now = self._now()
        running = jobs.c.status == "running"
        requeue = (
            update(jobs)
            .where(running, jobs.c.attempts < max_attempts)
            .values(status="queued", progress=0, started_at=None, updated_at=now)
            .returning(*jobs.c)
        )
        give_up = (
            update(jobs)
            .where(running, jobs.c.attempts >= max_attempts)
            .values(status="failed", error=error, finished_at=now, updated_at=now)
            .returning(*jobs.c)
        )
        with self._engine.begin() as conn:
            requeued = [_to_job(row) for row in conn.execute(requeue)]
            failed = [_to_job(row) for row in conn.execute(give_up)]
        return InterruptedJobs(requeued=requeued, failed=failed)

    def _update_running(self, job_id: str, **values: Any) -> None:
        # Hanya job yang sedang running yang boleh berubah (aturan transisi di domain).
        stmt = (
            update(jobs)
            .where(jobs.c.id == job_id, jobs.c.status == "running")
            .values(updated_at=self._now(), **values)
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)
