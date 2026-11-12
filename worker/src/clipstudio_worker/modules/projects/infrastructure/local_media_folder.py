import os
import shutil
from collections.abc import Sequence
from pathlib import Path

import structlog

from clipstudio_worker.modules.projects.application import MediaEntry, MediaFolder
from clipstudio_worker.shared.paths import resolve_data_path

log = structlog.get_logger()


def _entry(data_dir: Path, path: Path) -> MediaEntry:
    return MediaEntry(
        path=path.relative_to(data_dir).as_posix(),
        modified_ms=int(path.lstat().st_mtime * 1000),
    )


def _size(path: Path) -> int:
    if path.is_symlink() or path.is_file():
        return path.lstat().st_size
    return sum(
        (Path(root) / name).lstat().st_size for root, _, names in os.walk(path) for name in names
    )


class LocalMediaFolder(MediaFolder):
    """Folder `<data>/media`. Path keluar-masuk relatif terhadap direktori data."""

    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir.resolve()
        self._media = self._data_dir / "media"

    def project_dirs(self) -> Sequence[MediaEntry]:
        if not self._media.is_dir():
            return []
        return [
            _entry(self._data_dir, p)
            for p in self._media.iterdir()
            if p.is_dir() and not p.is_symlink()
        ]

    def files(self) -> Sequence[MediaEntry]:
        if not self._media.is_dir():
            return []
        return [
            _entry(self._data_dir, Path(root) / name)
            for root, _, names in os.walk(self._media)
            for name in names
        ]

    def remove(self, path: str) -> int:
        try:
            target = resolve_data_path(self._data_dir, path)
            # Hanya isi media/ yang boleh dihapus bersih-bersih.
            if not target.is_relative_to(self._media) or target == self._media:
                raise ValueError(f"Bukan isi folder media: {path}")
            size = _size(target)
            if target.is_dir() and not target.is_symlink():
                shutil.rmtree(target)
            else:
                target.unlink()
        except FileNotFoundError:
            return 0
        except (OSError, ValueError) as exc:
            log.warning("media_gagal_dihapus", path=path, error=str(exc))
            return 0
        return size
