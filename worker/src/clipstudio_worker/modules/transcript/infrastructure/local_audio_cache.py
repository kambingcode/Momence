from pathlib import Path

import structlog

from clipstudio_worker.modules.projects.application import MediaProcessor
from clipstudio_worker.modules.transcript.application import AudioCache, AudioUnavailableError
from clipstudio_worker.shared.paths import resolve_data_path

log = structlog.get_logger()


class LocalAudioCache(AudioCache):
    """`audio.wav` di folder proyek; dibuat ulang lewat `MediaProcessor` (ffmpeg) bila hilang."""

    def __init__(self, data_dir: Path, media: MediaProcessor) -> None:
        self._data_dir = data_dir
        self._media = media

    def ensure(self, source_path: str, audio_path: str, duration_ms: int) -> None:
        if resolve_data_path(self._data_dir, audio_path).is_file():
            return
        if not resolve_data_path(self._data_dir, source_path).is_file():
            raise AudioUnavailableError(
                "Audio sudah dihapus dan video sumber belum ada (mungkin masih diunduh). "
                "Coba lagi setelah video selesai diunduh."
            )
        log.info("audio_dibuat_ulang", path=audio_path)
        self._media.extract_audio(source_path, audio_path, duration_ms, lambda _: None)

    def discard(self, audio_path: str) -> None:
        try:
            resolve_data_path(self._data_dir, audio_path).unlink()
        except FileNotFoundError:
            return
        except (OSError, ValueError) as exc:
            log.warning("audio_gagal_dihapus", path=audio_path, error=str(exc))
