"""Aturan murni thumbnail proyek: lokasi file & detik pengambilan frame."""

import posixpath

THUMBNAIL_NAME = "thumb.jpg"
THUMBNAIL_WIDTH = 320

_MIN_OFFSET_MS = 1000


class ThumbnailError(Exception):
    """Thumbnail gagal dibuat. Tidak fatal: thumbnail hanya hiasan dashboard."""


def thumbnail_path(media_path: str) -> str:
    """`media/<id>/proxy.mp4` → `media/<id>/thumb.jpg` (satu folder dengan file medianya)."""
    return posixpath.join(posixpath.dirname(media_path), THUMBNAIL_NAME)


def thumbnail_offset_ms(duration_ms: int) -> int:
    """±10% durasi, minimal 1 detik (hindari fade-in/hitam di awal); video yang lebih pendek dari
    itu diambil di tengahnya."""
    offset = max(_MIN_OFFSET_MS, duration_ms // 10)
    return offset if offset < duration_ms else duration_ms // 2
