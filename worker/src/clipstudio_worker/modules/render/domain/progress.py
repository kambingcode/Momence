"""Progres render: tahap renderer → progres job 0–100."""

# Rentang progres job per tahap. Unduhan Chrome hanya terjadi sekali; render paling lama.
_STAGES: dict[str, tuple[float, float]] = {
    "browser": (0.0, 10.0),
    "bundle": (10.0, 20.0),
    "render": (20.0, 100.0),
}


def job_progress(stage: str, fraction: float) -> float | None:
    """Progres job untuk `fraction` (0–1) dari tahap `stage`; tahap tak dikenal → `None`."""
    span = _STAGES.get(stage)
    if span is None:
        return None
    start, end = span
    return start + min(1.0, max(0.0, fraction)) * (end - start)
