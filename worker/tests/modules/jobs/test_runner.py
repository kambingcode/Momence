from collections.abc import Mapping
from dataclasses import replace
from typing import Any

from clipstudio_worker.modules.jobs.application import (
    Job,
    JobFailure,
    JobRunner,
    NoopJob,
    ReportProgress,
)
from clipstudio_worker.modules.jobs.domain.job import MAX_ATTEMPTS, MAX_ERROR_LENGTH
from tests.modules.jobs.fakes import InMemoryJobRepository


def no_sleep(_seconds: float) -> None:
    pass


def test_runs_noop_job_to_done_with_progress() -> None:
    repo = InMemoryJobRepository()
    job = repo.enqueue("noop", None, {"durationMs": 500})
    runner = JobRunner(repo, {"noop": NoopJob(sleep=no_sleep)})

    claimed = runner.claim_next()
    assert claimed is not None
    outcome = runner.run(claimed)

    assert outcome.status == "done"
    assert repo.jobs[job.id].status == "done"
    assert repo.results[job.id] == {"sleptMs": 500}
    assert [p for _, p in repo.progress_writes] == list(range(10, 101, 10))


def test_only_claims_job_types_with_a_handler() -> None:
    repo = InMemoryJobRepository()
    later = repo.enqueue("transcribe", None, {})
    noop = repo.enqueue("noop", None, {})
    runner = JobRunner(repo, {"noop": NoopJob(sleep=no_sleep)})

    claimed = runner.claim_next()
    assert claimed is not None and claimed.id == noop.id
    assert runner.claim_next() is None
    assert repo.jobs[later.id].status == "queued"


def test_unknown_job_type_fails_with_clear_error() -> None:
    repo = InMemoryJobRepository()
    job = repo.enqueue("misteri", None, {})
    runner = JobRunner(repo, {})

    claimed = repo.claim_next(["misteri"])
    assert claimed is not None
    outcome = runner.run(claimed)

    assert outcome.status == "failed"
    assert repo.errors[job.id] == "Tipe job tidak dikenal: misteri"


def test_handler_exception_marks_job_failed() -> None:
    def broken(_job: Job, _report: ReportProgress) -> Mapping[str, Any]:
        raise ValueError("file rusak")

    repo = InMemoryJobRepository()
    job = repo.enqueue("ingest", None, {})
    runner = JobRunner(repo, {"ingest": broken})
    claimed = runner.claim_next()
    assert claimed is not None

    outcome = runner.run(claimed)
    assert outcome.error == (
        "Galat tak terduga di worker — ValueError: file rusak. Detail ada di log worker."
    )
    # Galatnya ikut dikembalikan agar CLI mencatat traceback lengkap.
    assert isinstance(outcome.exception, ValueError)
    assert repo.jobs[job.id].status == "failed"


def test_invalid_noop_payload_fails_job() -> None:
    repo = InMemoryJobRepository()
    job = repo.enqueue("noop", None, {"durationMs": -1})
    runner = JobRunner(repo, {"noop": NoopJob(sleep=no_sleep)})
    claimed = runner.claim_next()
    assert claimed is not None

    outcome = runner.run(claimed)
    assert outcome.status == "failed"
    assert outcome.error == (
        "Data job tidak valid (durationMs: Input should be greater than or equal to 0). "
        "Versi web & worker mungkin berbeda."
    )
    assert repo.jobs[job.id].status == "failed"


def test_progress_writes_only_when_rounded_value_changes() -> None:
    def chatty(_job: Job, report: ReportProgress) -> Mapping[str, Any]:
        for value in (0.2, 0.4, 1.0, 1.2, 50.0, 50.4):
            report(value)
        return {}

    repo = InMemoryJobRepository()
    repo.enqueue("chatty", None, {})
    runner = JobRunner(repo, {"chatty": chatty})
    claimed = runner.claim_next()
    assert claimed is not None
    runner.run(claimed)

    assert [p for _, p in repo.progress_writes] == [1, 50]


def test_expected_failure_message_is_shown_without_type_name() -> None:
    def picky(_job: Job, _report: ReportProgress) -> Mapping[str, Any]:
        raise JobFailure("Video tidak punya trek audio.")

    repo = InMemoryJobRepository()
    job = repo.enqueue("ingest", None, {})
    runner = JobRunner(repo, {"ingest": picky})
    claimed = runner.claim_next()
    assert claimed is not None

    assert runner.run(claimed).error == "Video tidak punya trek audio."
    assert repo.errors[job.id] == "Video tidak punya trek audio."


def test_expected_failure_keeps_no_exception_and_long_messages_are_cut() -> None:
    def noisy(_job: Job, _report: ReportProgress) -> Mapping[str, Any]:
        raise JobFailure("ffmpeg gagal:\n" + "x" * 5000)

    repo = InMemoryJobRepository()
    job = repo.enqueue("render", None, {})
    runner = JobRunner(repo, {"render": noisy})
    claimed = runner.claim_next()
    assert claimed is not None

    outcome = runner.run(claimed)
    assert outcome.exception is None
    assert len(repo.errors[job.id]) == MAX_ERROR_LENGTH
    assert repo.errors[job.id].endswith("…")


def test_recover_interrupted_requeues_until_attempt_limit() -> None:
    repo = InMemoryJobRepository()
    fresh = repo.enqueue("ingest", "p1", {"sourceId": "a"})
    stubborn = repo.enqueue("ingest", "p1", {"sourceId": "b"})
    waiting = repo.enqueue("ingest", "p1", {"sourceId": "c"})
    runner = JobRunner(repo, {"ingest": lambda _job, _report: {}})
    # Worker mati di tengah job: tetap `running`.
    repo.jobs[fresh.id] = replace(fresh, status="running", attempts=1)
    repo.jobs[stubborn.id] = replace(stubborn, status="running", attempts=MAX_ATTEMPTS)

    interrupted = runner.recover_interrupted()

    assert [j.id for j in interrupted.requeued] == [fresh.id]
    assert [j.id for j in interrupted.failed] == [stubborn.id]
    assert repo.jobs[fresh.id].status == "queued"
    assert repo.jobs[stubborn.id].status == "failed"
    assert "Coba lagi" in repo.errors[stubborn.id]
    assert repo.jobs[waiting.id].status == "queued"
