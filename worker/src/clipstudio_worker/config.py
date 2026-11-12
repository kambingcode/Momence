"""Satu-satunya tempat membaca env di worker; hasilnya disuntikkan lewat bootstrap."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values

# Secret (GEMINI_API_KEY) disimpan di worker/.env; env shell yang tidak kosong tetap menang.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

# Fragmen HLS/DASH yang diunduh bersamaan. Diukur pada VOD Twitch 1080p60 (T17.1): 1 → 3,1 MB/s,
# 4 → 8,2, 8 → 10,0, 16 → 10,5 (jalur internet penuh); 8 sudah mendekati batas jalur.
DEFAULT_DOWNLOAD_CONCURRENCY = 8
MAX_DOWNLOAD_CONCURRENCY = 32
# Permintaan Gemini bersamaan saat discover (jendela ±10 mnt). Jendela pertama selalu sendirian
# agar cache prompt sistem terisi; batas atas menjaga rate limit akun.
DEFAULT_DISCOVER_CONCURRENCY = 4
MAX_DISCOVER_CONCURRENCY = 16


class ConfigError(ValueError):
    """Nilai env tidak valid; pesannya untuk pengguna."""


@dataclass(frozen=True)
class WorkerConfig:
    data_dir: Path
    database_path: Path
    # Repo Hugging Face model mlx-whisper.
    whisper_model: str
    gemini_model: str
    # Folder web/ (skrip render Remotion) dan perintah Node untuk menjalankannya.
    web_dir: Path
    node: str
    download_concurrency: int = DEFAULT_DOWNLOAD_CONCURRENCY
    discover_concurrency: int = DEFAULT_DISCOVER_CONCURRENCY
    # Tanpa key, SDK Gemini membaca GEMINI_API_KEY / GOOGLE_API_KEY dari env proses.
    gemini_api_key: str | None = field(default=None, repr=False)


def load_config(env: dict[str, str] | None = None) -> WorkerConfig:
    if env is None:
        file_values = {k: v for k, v in dotenv_values(ENV_FILE).items() if v is not None}
        # `export GEMINI_API_KEY=` (kosong) di shell tidak boleh menimpa key di .env.
        source = {**file_values, **{k: v for k, v in os.environ.items() if v}}
    else:
        source = env
    repo_dir = Path(__file__).resolve().parents[3]
    default_data_dir = repo_dir / "data"
    data_dir = Path(source.get("CLIPSTUDIO_DATA_DIR", default_data_dir)).resolve()
    return WorkerConfig(
        data_dir=data_dir,
        database_path=data_dir / "clipstudio.db",
        whisper_model=source.get(
            "CLIPSTUDIO_WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo"
        ),
        gemini_model=source.get("CLIPSTUDIO_GEMINI_MODEL", "gemini-3.6-flash"),
        web_dir=Path(source.get("CLIPSTUDIO_WEB_DIR", repo_dir / "web")).resolve(),
        node=source.get("CLIPSTUDIO_NODE", "node"),
        download_concurrency=_bounded_int(
            source,
            "CLIPSTUDIO_DOWNLOAD_CONCURRENCY",
            DEFAULT_DOWNLOAD_CONCURRENCY,
            MAX_DOWNLOAD_CONCURRENCY,
        ),
        discover_concurrency=_bounded_int(
            source,
            "CLIPSTUDIO_DISCOVER_CONCURRENCY",
            DEFAULT_DISCOVER_CONCURRENCY,
            MAX_DISCOVER_CONCURRENCY,
        ),
        gemini_api_key=source.get("GEMINI_API_KEY") or None,
    )


def _bounded_int(source: dict[str, str], name: str, default: int, maximum: int) -> int:
    raw = source.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        value = 0
    if not 1 <= value <= maximum:
        raise ConfigError(f"{name} harus bilangan bulat 1–{maximum} (sekarang: {raw!r}).")
    return value
