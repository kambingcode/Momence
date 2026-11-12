"""Kunci file: hanya satu worker per direktori data.

Pemulihan job yang terputus (`JobRunner.recover_interrupted`) menganggap setiap job `running`
ditinggalkan worker yang sudah mati; itu hanya benar bila tidak ada worker lain yang berjalan.
Kunci `flock` dilepas OS saat proses berakhir, termasuk saat dimatikan paksa (SIGKILL).
"""

import fcntl
from pathlib import Path
from typing import IO


class WorkerLockedError(RuntimeError):
    """Worker lain sedang memegang kunci."""


def acquire_worker_lock(path: Path) -> IO[str]:
    """Ambil kunci eksklusif; simpan objek hasilnya selama worker hidup (ditutup = dilepas)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        handle.close()
        raise WorkerLockedError(str(path)) from exc
    return handle
