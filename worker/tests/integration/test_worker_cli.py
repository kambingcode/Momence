"""`worker run` sebagai proses sungguhan: berhenti rapi saat menerima sinyal."""

import json
import os
import signal
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import pytest

from tests.integration.conftest import apply_web_migrations

STARTUP_TIMEOUT_S = 30
STOP_TIMEOUT_S = 5


def start_worker(tmp_path: Path, poll_interval: float) -> subprocess.Popen[str]:
    data = tmp_path / "data"
    data.mkdir()
    apply_web_migrations(data / "clipstudio.db")
    return subprocess.Popen(
        [
            sys.executable, "-c", "from clipstudio_worker.cli import app; app()",
            "run", "--poll-interval", str(poll_interval),
        ],
        env={**os.environ, "CLIPSTUDIO_DATA_DIR": str(data)},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )  # fmt: skip


def wait_for_idle(process: subprocess.Popen[str]) -> None:
    assert process.stdout is not None
    deadline = time.monotonic() + STARTUP_TIMEOUT_S
    for line in process.stdout:
        if "idle" in line:
            return
        assert time.monotonic() < deadline, "worker tidak pernah idle"
    pytest.fail("worker berhenti sebelum idle")


@pytest.mark.parametrize("trial", range(5))
def test_twin_signals_while_idle_stop_the_worker_promptly(tmp_path: Path, trial: int) -> None:
    """`uv run` meneruskan Ctrl+C/SIGTERM sehingga worker menerima dua sinyal nyaris bersamaan;
    sinyal kedua bisa tiba di tengah handler pertama. Worker harus tetap berhenti rapi."""
    # Polling sangat rapat: sinyal hampir pasti tiba di tengah penantian polling.
    process = start_worker(tmp_path, poll_interval=0.001)
    try:
        wait_for_idle(process)
        time.sleep(0.05)
        process.send_signal(signal.SIGINT)
        # Sinyal kedua beberapa milidetik kemudian (seperti yang diteruskan `uv run`), agar
        # tiba saat handler pertama masih berjalan; sinyal sejenis yang beruntun digabung kernel.
        time.sleep(0.0005 * (trial + 1))
        process.send_signal(signal.SIGINT)
        # Macet (deadlock di handler sinyal) → TimeoutExpired. Kode keluar tidak diperiksa:
        # sinyal kedua bisa tiba saat Python sudah memulihkan handler bawaan ketika keluar.
        process.wait(timeout=STOP_TIMEOUT_S)
        assert process.stdout is not None
        assert "worker_berhenti" in process.stdout.read()
    finally:
        process.kill()


def worker_status(tmp_path: Path) -> dict[str, object]:
    with sqlite3.connect(tmp_path / "data" / "clipstudio.db") as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = 'worker'").fetchone()
    assert row is not None, "worker belum menulis status"
    return json.loads(row[0])


def test_worker_reports_status_while_running_and_when_stopped(tmp_path: Path) -> None:
    process = start_worker(tmp_path, poll_interval=0.05)
    try:
        wait_for_idle(process)
        running = worker_status(tmp_path)
        assert running["stoppedAt"] is None
        assert isinstance(running["geminiApiKey"], bool)
        process.send_signal(signal.SIGTERM)
        process.wait(timeout=STOP_TIMEOUT_S)
        stopped = worker_status(tmp_path)
        assert isinstance(stopped["stoppedAt"], int)
        assert stopped["stoppedAt"] >= running["heartbeatAt"]  # pyright: ignore[reportOperatorIssue]
    finally:
        process.kill()


def enqueue_noop(tmp_path: Path, duration_ms: int) -> str:
    """Seperti web: sisipkan job `noop` langsung ke tabel jobs."""
    job_id = "job-uji"
    with sqlite3.connect(tmp_path / "data" / "clipstudio.db") as conn:
        conn.execute(
            "INSERT INTO jobs (id, type, payload) VALUES (?, 'noop', ?)",
            (job_id, json.dumps({"durationMs": duration_ms})),
        )
    return job_id


def job_row(tmp_path: Path, job_id: str) -> tuple[str, int, int]:
    with sqlite3.connect(tmp_path / "data" / "clipstudio.db") as conn:
        return conn.execute(
            "SELECT status, progress, attempts FROM jobs WHERE id = ?", (job_id,)
        ).fetchone()


def run_worker(tmp_path: Path, *args: str) -> subprocess.Popen[str]:
    return subprocess.Popen(
        [sys.executable, "-c", "from clipstudio_worker.cli import app; app()", "run", *args],
        env={**os.environ, "CLIPSTUDIO_DATA_DIR": str(tmp_path / "data")},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )


def test_job_interrupted_by_killed_worker_is_rerun_after_restart(tmp_path: Path) -> None:
    """Kriteria T9.2: worker dimatikan di tengah job lalu dinyalakan lagi → job diulang."""
    data = tmp_path / "data"
    data.mkdir()
    apply_web_migrations(data / "clipstudio.db")
    job_id = enqueue_noop(tmp_path, duration_ms=20_000)

    first = run_worker(tmp_path, "--poll-interval", "0.05")
    try:
        deadline = time.monotonic() + STARTUP_TIMEOUT_S
        while job_row(tmp_path, job_id)[1] < 10:  # sudah berjalan & melapor progres
            assert time.monotonic() < deadline, "job tidak pernah berjalan"
            time.sleep(0.05)
        first.kill()  # SIGKILL: tanpa kesempatan membereskan apa pun
        first.wait(timeout=STOP_TIMEOUT_S)
    finally:
        first.kill()
    status, progress, attempts = job_row(tmp_path, job_id)
    assert (status, attempts) == ("running", 1) and progress >= 10

    # Job dipendekkan agar tes cepat; payload tetap valid.
    with sqlite3.connect(data / "clipstudio.db") as conn:
        conn.execute("UPDATE jobs SET payload = ? WHERE id = ?", ('{"durationMs": 50}', job_id))
    second = run_worker(tmp_path, "--once")
    output, _ = second.communicate(timeout=STARTUP_TIMEOUT_S)
    assert second.returncode == 0, output
    assert "job_diulang" in output
    assert job_row(tmp_path, job_id) == ("done", 100, 2)


def test_second_worker_on_same_data_refuses_to_start(tmp_path: Path) -> None:
    process = start_worker(tmp_path, poll_interval=0.05)
    try:
        wait_for_idle(process)
        second = run_worker(tmp_path, "--once")
        output, _ = second.communicate(timeout=STARTUP_TIMEOUT_S)
        assert second.returncode == 1
        assert "Worker lain sudah berjalan" in output
    finally:
        process.kill()
