from clipstudio_worker.modules.settings.application import (
    CurrentSettings,
    Preferences,
    ReportWorkerStatus,
    SettingsRepository,
    StoredPreferences,
    StoredWorkerStatus,
    WorkerStatus,
)


class InMemorySettings(SettingsRepository):
    def __init__(self) -> None:
        self.preferences = Preferences()
        self.statuses: list[WorkerStatus] = []
        self.loads = 0

    def load_preferences(self) -> Preferences:
        self.loads += 1
        return self.preferences

    def save_worker_status(self, status: WorkerStatus) -> None:
        self.statuses.append(status)


def test_model_and_fillers_are_read_on_every_request() -> None:
    repo = InMemorySettings()
    current = CurrentSettings(repo, "gemini-3.6-flash")
    assert (current.gemini_model(), current.filler_words()) == ("gemini-3.6-flash", None)

    # Diubah dari halaman Settings saat worker berjalan → berlaku untuk permintaan berikutnya.
    repo.preferences = Preferences(gemini_model="gemini-3.5-flash-lite", filler_words=frozenset())
    assert (current.gemini_model(), current.filler_words()) == (
        "gemini-3.5-flash-lite",
        frozenset(),
    )
    assert repo.loads == 4


def test_stored_preferences_follow_web_shape() -> None:
    stored = StoredPreferences.model_validate(
        {
            "geminiModel": " gemini-3.5-flash-lite ",
            "fillerWords": ["Ummm", "eh"],
            "fillerPhrases": ["apa ya"],
            "pauseMinMs": 800,
        }
    )
    assert stored.to_preferences() == Preferences(
        gemini_model="gemini-3.5-flash-lite", filler_words=frozenset({"Ummm", "eh"})
    )
    assert StoredPreferences.model_validate({"geminiModel": None}).to_preferences() == (
        Preferences()
    )


def test_worker_status_heartbeat_then_stopped() -> None:
    repo = InMemorySettings()
    clock = iter([1_000, 31_000, 40_000])
    report = ReportWorkerStatus(
        repo,
        gemini_api_key=True,
        gemini_model="gemini-3.6-flash",
        whisper_model="whisper",
        now=lambda: next(clock),
    )
    report.heartbeat()
    report.heartbeat()
    report.stopped()
    assert [(s.heartbeat_at, s.stopped_at) for s in repo.statuses] == [
        (1_000, None),
        (31_000, None),
        (40_000, 40_000),
    ]
    assert StoredWorkerStatus.of(repo.statuses[-1]).model_dump(by_alias=True) == {
        "geminiApiKey": True,
        "geminiModel": "gemini-3.6-flash",
        "whisperModel": "whisper",
        "heartbeatAt": 40_000,
        "stoppedAt": 40_000,
    }
