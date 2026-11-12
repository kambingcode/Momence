import threading
from collections.abc import Collection, Mapping
from typing import Any

from clipstudio_worker.cli import StopRequest, _run_lanes  # pyright: ignore[reportPrivateUsage]
from clipstudio_worker.modules.jobs.application import Job, JobRepository, JobRunner, ReportProgress
from tests.modules.jobs.fakes import InMemoryJobRepository


class LockedJobs(InMemoryJobRepository):
    """Lane berjalan di thread berbeda; fake dalam-memori perlu kunci (DB sungguhan atomik)."""

    def __init__(self) -> None:
        super().__init__()
        self._lock = threading.RLock()

    def claim_next(self, types: Collection[str]) -> Job | None:
        with self._lock:
            return super().claim_next(types)

    def enqueue(self, job_type: str, project_id: str | None, payload: Mapping[str, Any]) -> Job:
        with self._lock:
            return super().enqueue(job_type, project_id, payload)

    def complete(self, job_id: str, result: Mapping[str, Any]) -> None:
        with self._lock:
            super().complete(job_id, result)

    def update_progress(self, job_id: str, progress: int) -> None:
        with self._lock:
            super().update_progress(job_id, progress)


def lanes(
    jobs: JobRepository, main: dict[str, Any], **background: dict[str, Any]
) -> tuple[JobRunner, list[tuple[str, JobRunner]]]:
    return JobRunner(jobs, main), [(n, JobRunner(jobs, h)) for n, h in background.items()]


def run(
    main: JobRunner,
    background: list[tuple[str, JobRunner]],
    stop: StopRequest | None = None,
    once: bool = True,
) -> None:
    _run_lanes(main, background, stop or StopRequest(), 0.005, once)


def test_once_waits_for_follow_up_jobs_queued_by_another_lane() -> None:
    jobs = LockedJobs()
    seen: dict[str, str] = {}

    def ingest(job: Job, report: ReportProgress) -> Mapping[str, Any]:
        # Lambat: lane utama sudah melihat antrean kosong sebelum job lanjutan ini diantre.
        threading.Event().wait(0.2)
        jobs.enqueue("transcribe", "p1", {})
        return {}

    def transcribe(job: Job, report: ReportProgress) -> Mapping[str, Any]:
        seen["thread"] = threading.current_thread().name
        return {}

    jobs.enqueue("ingest", "p1", {})
    main, background = lanes(jobs, {"transcribe": transcribe}, video={"ingest": ingest})

    run(main, background)

    assert {j.type: j.status for j in jobs.jobs.values()} == {
        "ingest": "done",
        "transcribe": "done",
    }
    # Job lane utama selalu di thread utama (MLX/MediaPipe tidak boleh pindah thread).
    assert seen["thread"] == threading.main_thread().name


def test_lanes_run_jobs_at_the_same_time() -> None:
    jobs = LockedJobs()
    video_started, main_started = threading.Event(), threading.Event()
    both_running: list[bool] = []

    def download(job: Job, report: ReportProgress) -> Mapping[str, Any]:
        video_started.set()
        both_running.append(main_started.wait(5))
        return {}

    def transcribe(job: Job, report: ReportProgress) -> Mapping[str, Any]:
        main_started.set()
        both_running.append(video_started.wait(5))
        return {}

    jobs.enqueue("download", "p1", {})
    jobs.enqueue("transcribe", "p2", {})
    main, background = lanes(jobs, {"transcribe": transcribe}, video={"download": download})

    run(main, background)

    # Masing-masing menunggu yang lain mulai: hanya mungkin bila berjalan bersamaan.
    assert both_running == [True, True]
    assert all(j.status == "done" for j in jobs.jobs.values())


def test_jobs_only_run_in_their_own_lane() -> None:
    jobs = LockedJobs()
    threads: dict[str, str] = {}

    def record(name: str):
        def handler(job: Job, report: ReportProgress) -> Mapping[str, Any]:
            threads[name] = threading.current_thread().name
            return {}

        return handler

    for job_type in ("download-audio", "download", "transcribe"):
        jobs.enqueue(job_type, "p1", {})
    main, background = lanes(
        jobs,
        {"transcribe": record("transcribe")},
        audio={"download-audio": record("download-audio")},
        video={"download": record("download")},
    )

    run(main, background)

    assert threads["transcribe"] == threading.main_thread().name
    assert threads["download-audio"] == "lane-audio"
    assert threads["download"] == "lane-video"


def test_stop_request_ends_all_lanes_after_their_current_job() -> None:
    jobs = LockedJobs()
    stop = StopRequest()
    finished: list[str] = []

    def slow(job: Job, report: ReportProgress) -> Mapping[str, Any]:
        stop.requested = True  # Ctrl+C datang saat job berjalan
        threading.Event().wait(0.1)
        finished.append(job.type)
        return {}

    jobs.enqueue("download", "p1", {})
    jobs.enqueue("download", "p2", {"x": 1})  # tidak boleh diambil setelah berhenti diminta
    main, background = lanes(jobs, {}, video={"download": slow})

    run(main, background, stop, once=False)

    assert finished == ["download"]
    assert [j.status for j in jobs.jobs.values()] == ["done", "queued"]


def test_crashed_lane_stops_the_worker_instead_of_hanging_silently() -> None:
    jobs = LockedJobs()
    stop = StopRequest()

    class Broken(JobRunner):
        def claim_next(self) -> Job | None:
            raise RuntimeError("DB hilang")

    def download(job: Job, report: ReportProgress) -> Mapping[str, Any]:
        return {}

    main = JobRunner(jobs, {})
    background: list[tuple[str, JobRunner]] = [("video", Broken(jobs, {"download": download}))]

    run(main, background, stop, once=False)

    assert stop.requested
