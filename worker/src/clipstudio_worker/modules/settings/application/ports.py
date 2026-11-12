from typing import Protocol

from clipstudio_worker.modules.settings.domain.preferences import Preferences, WorkerStatus


class SettingsRepository(Protocol):
    def load_preferences(self) -> Preferences:
        """Pengaturan tersimpan; belum ada / rusak → `Preferences()` (semua bawaan)."""
        ...

    def save_worker_status(self, status: WorkerStatus) -> None: ...
