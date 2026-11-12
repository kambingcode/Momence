from collections.abc import Callable
from dataclasses import dataclass

from clipstudio_worker.modules.projects.application.ports import MediaFolder, ProjectIndex
from clipstudio_worker.modules.projects.domain.cleanup import plan_cleanup


@dataclass(frozen=True)
class CleanupResult:
    orphan_dirs: list[str]
    partial_files: list[str]
    freed_bytes: int


class CleanMedia:
    """Hapus folder media tanpa proyek (sisa unggahan/hapus yang terputus) dan file sementara
    `.part` yang ditinggalkan proses yang mati. Dijalankan saat worker mulai; kunci satu-worker
    menjamin tidak ada job lain yang sedang menulis."""

    def __init__(self, projects: ProjectIndex, media: MediaFolder, now: Callable[[], int]) -> None:
        self._projects = projects
        self._media = media
        self._now = now

    def __call__(self) -> CleanupResult:
        plan = plan_cleanup(
            self._media.project_dirs(),
            self._media.files(),
            self._projects.project_ids(),
            self._now(),
        )
        freed = sum(self._media.remove(path) for path in plan.orphan_dirs + plan.partial_files)
        return CleanupResult(plan.orphan_dirs, plan.partial_files, freed)
