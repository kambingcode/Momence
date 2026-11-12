"""Pengaturan pengguna & status worker; cermin dari web/src/shared/schemas/settings.ts."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Preferences:
    """Pengaturan dari halaman Settings yang dipakai worker. `None` = nilai bawaan."""

    gemini_model: str | None = None
    filler_words: frozenset[str] | None = None


@dataclass(frozen=True)
class WorkerStatus:
    """Dilaporkan ke web (halaman Settings); tidak pernah berisi nilai key."""

    gemini_api_key: bool
    gemini_model: str
    whisper_model: str
    heartbeat_at: int
    # Epoch ms saat berhenti rapi; None selama berjalan.
    stopped_at: int | None = None
