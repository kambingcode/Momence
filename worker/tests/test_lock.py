from pathlib import Path

import pytest

from clipstudio_worker.lock import WorkerLockedError, acquire_worker_lock


def test_only_one_holder_and_released_when_closed(tmp_path: Path) -> None:
    path = tmp_path / "data" / "worker.lock"
    held = acquire_worker_lock(path)
    with pytest.raises(WorkerLockedError):
        acquire_worker_lock(path)
    held.close()
    acquire_worker_lock(path).close()
