"""Aturan murni unduhan video dari link."""

PROJECT_NAME_MAX_LENGTH = 120  # Sama dengan `projectNameFrom` di web.

GIB = 1024**3
# Saat digabung (remux) file video + audio sementara dan hasil akhir ada bersamaan di disk, lalu
# ingest menambah audio WAV & proxy. Margin tetap untuk yang terakhir itu.
_DISK_MARGIN_BYTES = 2 * GIB


class VideoDownloadError(Exception):
    """Video tidak bisa diunduh; pesannya untuk pengguna."""


def project_name_from_title(title: str | None, fallback: str) -> str:
    """Judul video → nama proyek (spasi dirapikan, dipotong); `fallback` bila judul kosong."""
    name = " ".join((title or "").split())
    return (name or fallback)[:PROJECT_NAME_MAX_LENGTH]


def required_download_bytes(expected_bytes: int) -> int:
    """Ruang kosong minimum untuk mengunduh video seukuran `expected_bytes`: dua kali ukuran
    (file sementara + hasil gabungan) ditambah margin untuk ingest."""
    return expected_bytes * 2 + _DISK_MARGIN_BYTES


def insufficient_disk_message(expected_bytes: int, free_bytes: int) -> str | None:
    """Pesan bila disk tidak cukup untuk video `expected_bytes`; `None` bila cukup atau ukuran
    video tidak diketahui (0)."""
    if expected_bytes <= 0:
        return None
    required = required_download_bytes(expected_bytes)
    if free_bytes >= required:
        return None
    return (
        f"Ruang disk tidak cukup: butuh ±{required / GIB:.1f} GB, tersisa "
        f"{free_bytes / GIB:.1f} GB. Kosongkan ruang (hapus proyek lama) lalu coba lagi."
    )


# (potongan pesan galat yt-dlp, huruf kecil) → penjelasan. Urutan penting: yang lebih spesifik dulu.
_KNOWN_FAILURES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("private video",), "Video ini privat; hanya pemiliknya yang bisa menontonnya."),
    (
        ("confirm your age", "age-restricted", "inappropriate for some users"),
        "Video dibatasi usia dan butuh login YouTube, jadi tidak bisa diunduh.",
    ),
    (
        ("not a bot",),
        "YouTube meminta verifikasi (deteksi bot). Coba lagi nanti, atau perbarui yt-dlp "
        "(`uv lock --upgrade-package yt-dlp` di worker/).",
    ),
    (
        ("members-only", "join this channel"),
        "Video khusus anggota kanal; tidak bisa diunduh tanpa login.",
    ),
    (
        ("subscriber", "subscribers-only", "sub-only"),
        "VOD ini khusus pelanggan (subscriber) kanal; tidak bisa diunduh tanpa login.",
    ),
    (
        ("available in your country", "geo restrict", "blocked it in your country"),
        "Video tidak tersedia di negara Anda.",
    ),
    (
        ("premieres in", "live event will begin", "this live event"),
        "Siaran/premiere belum dimulai; coba lagi setelah videonya tersedia.",
    ),
    (
        (
            "video unavailable",
            "video is unavailable",
            "has been removed",
            "no longer available",
            "does not exist",
            "http error 404",
        ),
        "Video tidak tersedia (dihapus, kedaluwarsa, atau link salah).",
    ),
    (
        (
            "unable to download webpage",
            "urlopen error",
            "name resolution",
            "nodename nor servname",
            "timed out",
            "connection reset",
        ),
        "Tidak bisa menghubungi server video (YouTube/Twitch); periksa koneksi internet lalu "
        "coba lagi.",
    ),
    (
        ("requested format is not available",),
        "Tidak ada format video yang bisa diunduh untuk video ini.",
    ),
)


def download_failure_message(raw: str) -> str:
    """Pesan galat mentah pengunduh → pesan berbahasa Indonesia untuk pengguna."""
    lowered = raw.lower()
    for needles, message in _KNOWN_FAILURES:
        if any(needle in lowered for needle in needles):
            return message
    detail = raw.removeprefix("ERROR:").strip()
    return f"Gagal mengunduh video: {detail}" if detail else "Gagal mengunduh video."
