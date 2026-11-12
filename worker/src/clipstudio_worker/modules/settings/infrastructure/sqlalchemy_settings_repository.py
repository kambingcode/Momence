import time
from collections.abc import Callable
from typing import Any

import structlog
from pydantic import ValidationError
from sqlalchemy import Engine, select
from sqlalchemy.dialects.sqlite import insert

from clipstudio_worker.modules.settings.application import (
    Preferences,
    SettingsRepository,
    StoredPreferences,
    StoredWorkerStatus,
    WorkerStatus,
)
from clipstudio_worker.modules.settings.infrastructure.tables import settings

log = structlog.get_logger()

_PREFERENCES_KEY = "preferences"
_WORKER_KEY = "worker"


def _now_ms() -> int:
    return time.time_ns() // 1_000_000


class SqlAlchemySettingsRepository(SettingsRepository):
    def __init__(self, engine: Engine, now: Callable[[], int] = _now_ms) -> None:
        self._engine = engine
        self._now = now

    def load_preferences(self) -> Preferences:
        with self._engine.connect() as conn:
            value = conn.execute(
                select(settings.c.value).where(settings.c.key == _PREFERENCES_KEY)
            ).scalar_one_or_none()
        if value is None:
            return Preferences()
        try:
            return StoredPreferences.model_validate(value).to_preferences()
        except ValidationError as exc:
            # Baris rusak tidak boleh menggagalkan setiap job: pakai bawaan.
            log.warning("pengaturan_rusak", error=str(exc))
            return Preferences()

    def save_worker_status(self, status: WorkerStatus) -> None:
        self._write(_WORKER_KEY, StoredWorkerStatus.of(status).model_dump(by_alias=True))

    def _write(self, key: str, value: Any) -> None:
        now = self._now()
        stmt = insert(settings).values(key=key, value=value, updated_at=now)
        stmt = stmt.on_conflict_do_update(
            index_elements=[settings.c.key], set_={"value": value, "updated_at": now}
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)
