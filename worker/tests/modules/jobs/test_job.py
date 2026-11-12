import math

from clipstudio_worker.modules.jobs.domain.job import (
    MAX_ERROR_LENGTH,
    can_transition,
    limit_error,
    normalize_progress,
)


def test_follows_queued_running_done_or_failed() -> None:
    assert can_transition("queued", "running")
    assert can_transition("running", "done")
    assert can_transition("running", "failed")


def test_rejects_skips_and_changes_from_final_state() -> None:
    assert not can_transition("queued", "done")
    assert not can_transition("done", "running")


def test_allows_retry_of_failed_job() -> None:
    assert can_transition("failed", "queued")


def test_normalize_progress_rounds_and_clamps() -> None:
    assert normalize_progress(42.6) == 43
    assert normalize_progress(-5) == 0
    assert normalize_progress(150) == 100
    assert normalize_progress(math.nan) == 0


def test_limit_error_trims_and_cuts_long_messages() -> None:
    assert limit_error("  gagal \n") == "gagal"
    assert limit_error("   ") == "Job gagal tanpa pesan."
    cut = limit_error("a" * (MAX_ERROR_LENGTH + 10))
    assert len(cut) == MAX_ERROR_LENGTH
    assert cut.endswith("…")
