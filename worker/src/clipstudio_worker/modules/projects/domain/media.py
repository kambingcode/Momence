"""Aturan murni metadata video & ukuran proxy."""

import math
from dataclasses import dataclass

PROXY_MAX_HEIGHT = 720
# Proxy hanya untuk pratinjau & analisis wajah (dibaca 15 fps); render memakai sumber asli.
PROXY_MAX_FPS = 30.0


@dataclass(frozen=True)
class MediaInfo:
    duration_ms: int
    # Ukuran tampilan (rotasi sudah diterapkan).
    width: int
    height: int
    fps: float | None
    has_audio: bool


class UnsupportedMediaError(Exception):
    """File tidak bisa diproses (mis. tanpa trek video/audio)."""


def parse_frame_rate(value: str | None) -> float | None:
    """'30000/1001' → 29.97; '0/0', kosong, atau tidak valid → None."""
    if not value:
        return None
    num, _, den = value.partition("/")
    try:
        rate = float(num) / float(den or "1")
    except (ValueError, ZeroDivisionError):
        return None
    return round(rate, 3) if rate > 0 else None


def display_size(width: int, height: int, rotation_degrees: float) -> tuple[int, int]:
    """Video ponsel sering disimpan landscape + metadata rotasi ±90°; tukar sisi bila perlu."""
    if round(abs(rotation_degrees)) % 180 == 90:
        return height, width
    return width, height


def proxy_size(width: int, height: int, max_height: int = PROXY_MAX_HEIGHT) -> tuple[int, int]:
    """Skala agar sisi pendek ≤ max_height (tanpa upscale); kedua sisi genap untuk H.264."""
    short_side = min(width, height)
    scale = min(1.0, max_height / short_side) if short_side > 0 else 1.0

    def even(value: float) -> int:
        # Pembulatan setengah ke atas (round() Python membulatkan .5 ke genap).
        return max(2, math.floor(value / 2 + 0.5) * 2)

    return even(width * scale), even(height * scale)


def proxy_frame_rate(fps: float | None, max_fps: float = PROXY_MAX_FPS) -> float | None:
    """Frame rate proxy untuk sumber di atas `max_fps`: dibagi bilangan bulat terkecil agar ritme
    frame tetap rata (60 → 30, 50 → 25, 59,94 → 29,97, 120 → 30). `None` = pakai frame rate
    sumber (≤ batas, atau tidak diketahui).

    Diukur pada VOD 1080p60 (T17.2): proxy 30 fps hampir 2× lebih cepat dibuat dan justru lebih
    tajam, karena batas bitrate proxy terbagi ke separuh jumlah frame.
    """
    if fps is None or fps <= max_fps + 0.01:
        return None
    return round(fps / math.ceil(fps / max_fps - 0.01), 3)
