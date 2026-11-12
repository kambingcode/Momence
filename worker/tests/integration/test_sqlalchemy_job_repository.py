import threading
from dataclasses import replace

import pytest
from sqlalchemy import Engine, Table, inspect, select, text, update

from clipstudio_worker.modules.jobs.infrastructure.sqlalchemy_job_repository import (
    SqlAlchemyJobRepository,
)
from clipstudio_worker.modules.jobs.infrastructure.tables import jobs
from clipstudio_worker.modules.projects.infrastructure.tables import sources

ALL = ["noop", "ingest", "transcribe", "discover"]


@pytest.mark.parametrize("table", [jobs, sources], ids=lambda t: t.name)
def test_mirror_table_matches_web_schema(engine: Engine, table: Table) -> None:
    db_columns = {c["name"] for c in inspect(engine).get_columns(table.name)}
    assert {c.name for c in table.columns} == db_columns


def test_claims_oldest_queued_job_first(engine: Engine) -> None:
    clock = iter(range(1, 100))
    repo = SqlAlchemyJobRepository(engine, now=lambda: next(clock))
    first = repo.enqueue("noop", None, {"durationMs": 1})
    repo.enqueue("noop", None, {"durationMs": 2})

    claimed = repo.claim_next(ALL)
    assert claimed is not None
    assert claimed.id == first.id
    assert claimed.status == "running"
    assert claimed.attempts == 1
    assert claimed.payload == {"durationMs": 1}


def test_returns_none_when_queue_empty(engine: Engine) -> None:
    assert SqlAlchemyJobRepository(engine).claim_next(ALL) is None


def test_only_claims_requested_types(engine: Engine) -> None:
    repo = SqlAlchemyJobRepository(engine)
    repo.enqueue("transcribe", None, {})
    ingest = repo.enqueue("ingest", None, {})

    claimed = repo.claim_next(["ingest", "noop"])
    assert claimed is not None and claimed.id == ingest.id
    assert repo.claim_next(["ingest", "noop"]) is None
    assert repo.claim_next([]) is None


def test_progress_complete_and_fail_only_touch_running_jobs(engine: Engine) -> None:
    repo = SqlAlchemyJobRepository(engine)
    done_job = repo.enqueue("noop", None, {"n": 1})
    failed_job = repo.enqueue("noop", None, {"n": 2})

    claimed = repo.claim_next(ALL)
    assert claimed is not None
    repo.update_progress(claimed.id, 150)
    repo.complete(claimed.id, {"ok": True})
    # Job yang sudah selesai tidak boleh berubah lagi.
    repo.fail(done_job.id, "terlambat")

    other = repo.claim_next(ALL)
    assert other is not None and other.id == failed_job.id
    repo.fail(other.id, "boom")

    with engine.connect() as conn:
        rows = {r.id: r for r in conn.execute(select(jobs))}
    assert rows[done_job.id].status == "done"
    assert rows[done_job.id].progress == 100
    assert rows[done_job.id].result == {"ok": True}
    assert rows[done_job.id].error is None
    assert rows[failed_job.id].status == "failed"
    assert rows[failed_job.id].error == "boom"
    assert rows[failed_job.id].finished_at is not None


def test_concurrent_claims_never_share_a_job(engine: Engine) -> None:
    repo = SqlAlchemyJobRepository(engine)
    total = 40
    for n in range(total):
        repo.enqueue("noop", None, {"n": n})

    claimed: list[str] = []
    lock = threading.Lock()

    def worker() -> None:
        while (job := repo.claim_next(ALL)) is not None:
            with lock:
                claimed.append(job.id)

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(claimed) == total
    assert len(set(claimed)) == total


def test_enqueue_reuses_pending_job_with_same_payload(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO projects (id, name) VALUES ('p1', 'Video')"))
    repo = SqlAlchemyJobRepository(engine)
    first = repo.enqueue("transcribe", "p1", {"sourceId": "s1"})
    # Ingest yang diulang mengantre transcribe yang sama → job yang masih antre dipakai ulang.
    assert repo.enqueue("transcribe", "p1", {"sourceId": "s1"}).id == first.id
    assert repo.enqueue("transcribe", "p1", {"sourceId": "s2"}).id != first.id
    assert repo.enqueue("transcribe", None, {"sourceId": "s1"}).id != first.id
    assert repo.enqueue("discover", "p1", {"sourceId": "s1"}).id != first.id

    claimed = repo.claim_next(["transcribe"])
    assert claimed is not None and claimed.id == first.id
    assert repo.enqueue("transcribe", "p1", {"sourceId": "s1"}).id == first.id  # running
    repo.complete(first.id, {})
    # Job yang sudah selesai tidak menghalangi job baru.
    assert repo.enqueue("transcribe", "p1", {"sourceId": "s1"}).id != first.id


def test_requeue_interrupted_jobs(engine: Engine) -> None:
    clock = iter(range(100, 200))
    repo = SqlAlchemyJobRepository(engine, now=lambda: next(clock))
    queued = repo.enqueue("noop", None, {"n": 1})
    first = repo.enqueue("noop", None, {"n": 2})
    stubborn = repo.enqueue("noop", None, {"n": 3})
    done = repo.enqueue("noop", None, {"n": 4})
    with engine.begin() as conn:
        conn.execute(
            update(jobs)
            .where(jobs.c.id.in_([first.id, stubborn.id]))
            .values(status="running", progress=40, started_at=400)
        )
        conn.execute(update(jobs).where(jobs.c.id == stubborn.id).values(attempts=3))
        conn.execute(update(jobs).where(jobs.c.id == done.id).values(status="done"))

    interrupted = repo.requeue_interrupted(3, "terlalu sering")

    assert [j.id for j in interrupted.requeued] == [first.id]
    assert [j.id for j in interrupted.failed] == [stubborn.id]
    with engine.connect() as conn:
        rows = {r.id: r for r in conn.execute(select(jobs))}
    assert (rows[first.id].status, rows[first.id].progress) == ("queued", 0)
    assert rows[first.id].started_at is None
    assert (rows[stubborn.id].status, rows[stubborn.id].error) == ("failed", "terlalu sering")
    assert rows[stubborn.id].finished_at is not None
    assert rows[queued.id].status == "queued"
    assert rows[done.id].status == "done"
    # Diulang sesuai urutan antre semula; klaim ulang menambah attempts sehingga batasnya
    # berlaku untuk kematian berikutnya.
    assert [repo.claim_next(["noop"]) for _ in range(2)] == [
        replace(queued, status="running", attempts=1),
        replace(first, status="running", attempts=1),
    ]
