from sqlalchemy import Engine, insert, inspect, select

from clipstudio_worker.modules.settings.application import Preferences, WorkerStatus
from clipstudio_worker.modules.settings.infrastructure.sqlalchemy_settings_repository import (
    SqlAlchemySettingsRepository,
)
from clipstudio_worker.modules.settings.infrastructure.tables import settings


def test_mirror_table_matches_web_schema(engine: Engine) -> None:
    db_columns = {c["name"] for c in inspect(engine).get_columns("settings")}
    assert {c.name for c in settings.columns} == db_columns


def test_reads_preferences_saved_by_web(engine: Engine) -> None:
    repo = SqlAlchemySettingsRepository(engine)
    assert repo.load_preferences() == Preferences()
    # Bentuk yang disimpan web (`DrizzleSettingsRepository.savePreferences`).
    with engine.begin() as conn:
        conn.execute(
            insert(settings).values(
                key="preferences",
                value={
                    "geminiModel": "gemini-3.5-flash-lite",
                    "fillerWords": ["eh", "anu"],
                    "fillerPhrases": ["apa ya"],
                    "pauseMinMs": 500,
                },
                updated_at=1,
            )
        )
    assert repo.load_preferences() == Preferences(
        gemini_model="gemini-3.5-flash-lite", filler_words=frozenset({"eh", "anu"})
    )


def test_broken_preferences_fall_back_to_defaults(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            insert(settings).values(key="preferences", value={"fillerWords": "eh"}, updated_at=1)
        )
    assert SqlAlchemySettingsRepository(engine).load_preferences() == Preferences()


def test_worker_status_is_upserted_in_web_shape(engine: Engine) -> None:
    repo = SqlAlchemySettingsRepository(engine, now=lambda: 5)
    status = WorkerStatus(
        gemini_api_key=False,
        gemini_model="gemini-3.6-flash",
        whisper_model="mlx-community/whisper-large-v3-turbo",
        heartbeat_at=1_700_000_000_000,
    )
    repo.save_worker_status(status)
    repo.save_worker_status(status)
    with engine.connect() as conn:
        rows = conn.execute(select(settings)).all()
    assert len(rows) == 1
    assert rows[0].key == "worker"
    # Sama dengan bentuk yang dibaca web (drizzle-settings-repository.test.ts).
    assert rows[0].value == {
        "geminiApiKey": False,
        "geminiModel": "gemini-3.6-flash",
        "whisperModel": "mlx-community/whisper-large-v3-turbo",
        "heartbeatAt": 1_700_000_000_000,
        "stoppedAt": None,
    }
