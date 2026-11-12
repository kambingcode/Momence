from pathlib import Path


def resolve_data_path(data_dir: Path, relative: str) -> Path:
    """Path relatif (dari application/DB) → path absolut yang dijamin tetap di dalam `data_dir`."""
    path = (data_dir / relative).resolve()
    if not path.is_relative_to(data_dir.resolve()):
        raise ValueError(f"Path di luar direktori data: {relative}")
    return path
