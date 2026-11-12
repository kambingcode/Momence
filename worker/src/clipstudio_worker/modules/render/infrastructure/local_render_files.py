from pathlib import Path

import structlog

from clipstudio_worker.modules.render.application import RenderFiles
from clipstudio_worker.shared.paths import resolve_data_path

log = structlog.get_logger()


class LocalRenderFiles(RenderFiles):
    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir

    def remove(self, path: str) -> None:
        try:
            resolve_data_path(self._data_dir, path).unlink()
        except FileNotFoundError:
            return
        except (OSError, ValueError) as exc:
            log.warning("render_lama_gagal_dihapus", path=path, error=str(exc))
            return
        log.info("render_lama_dihapus", path=path)
