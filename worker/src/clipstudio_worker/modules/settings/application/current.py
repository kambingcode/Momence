from collections.abc import Callable
from dataclasses import replace

from clipstudio_worker.modules.settings.application.ports import SettingsRepository
from clipstudio_worker.modules.settings.domain.preferences import WorkerStatus


class CurrentSettings:
    """Pengaturan halaman Settings, dibaca ulang setiap kali diminta: perubahan berlaku untuk job
    berikutnya tanpa menjalankan ulang worker."""

    def __init__(self, settings: SettingsRepository, default_gemini_model: str) -> None:
        self._settings = settings
        self._default_gemini_model = default_gemini_model

    def gemini_model(self) -> str:
        return self._settings.load_preferences().gemini_model or self._default_gemini_model

    def filler_words(self) -> frozenset[str] | None:
        """`None` = daftar bawaan job transkripsi; set kosong = tidak ada kata pengisi."""
        return self._settings.load_preferences().filler_words


class ReportWorkerStatus:
    """Tulis status worker untuk halaman Settings: saat mulai & berkala (detak), lalu berhenti."""

    def __init__(
        self,
        settings: SettingsRepository,
        *,
        gemini_api_key: bool,
        gemini_model: str,
        whisper_model: str,
        now: Callable[[], int],
    ) -> None:
        self._settings = settings
        self._now = now
        self._status = WorkerStatus(
            gemini_api_key=gemini_api_key,
            gemini_model=gemini_model,
            whisper_model=whisper_model,
            heartbeat_at=0,
        )

    def heartbeat(self) -> None:
        self._settings.save_worker_status(replace(self._status, heartbeat_at=self._now()))

    def stopped(self) -> None:
        now = self._now()
        self._settings.save_worker_status(replace(self._status, heartbeat_at=now, stopped_at=now))
