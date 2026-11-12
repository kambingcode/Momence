"""Model baris tabel `settings`; cermin dari web/src/shared/schemas/settings.ts."""

from pydantic import BaseModel, ConfigDict, Field

from clipstudio_worker.modules.settings.domain.preferences import Preferences, WorkerStatus


class StoredPreferences(BaseModel):
    """Baris `preferences` (`storedPreferencesSchema`); field yang tak dipakai worker diabaikan."""

    model_config = ConfigDict(populate_by_name=True, frozen=True)

    gemini_model: str | None = Field(default=None, alias="geminiModel")
    filler_words: list[str] | None = Field(default=None, alias="fillerWords")

    def to_preferences(self) -> Preferences:
        return Preferences(
            gemini_model=(self.gemini_model or "").strip() or None,
            filler_words=None if self.filler_words is None else frozenset(self.filler_words),
        )


class StoredWorkerStatus(BaseModel):
    """Baris `worker` (`workerStatusSchema`)."""

    model_config = ConfigDict(populate_by_name=True, frozen=True)

    gemini_api_key: bool = Field(alias="geminiApiKey")
    gemini_model: str = Field(alias="geminiModel")
    whisper_model: str = Field(alias="whisperModel")
    heartbeat_at: int = Field(alias="heartbeatAt")
    stopped_at: int | None = Field(alias="stoppedAt")

    @classmethod
    def of(cls, status: WorkerStatus) -> "StoredWorkerStatus":
        return cls.model_validate(
            {
                "geminiApiKey": status.gemini_api_key,
                "geminiModel": status.gemini_model,
                "whisperModel": status.whisper_model,
                "heartbeatAt": status.heartbeat_at,
                "stoppedAt": status.stopped_at,
            }
        )
