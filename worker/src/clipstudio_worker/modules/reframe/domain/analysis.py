"""Aturan murni analisis reframe: jadwal sampel frame, ukuran frame analisis, kotak wajah."""

import math
from collections.abc import Iterable
from dataclasses import dataclass

# Versi algoritma analisis; naikkan bila hasilnya berubah agar klip lama dianalisis ulang.
ANALYSIS_VERSION = 1
# Frame dibaca 15 fps untuk deteksi batas adegan (presisi ±67 ms); wajah dideteksi pada setiap
# frame ke-3 = sampel 5 fps.
FRAME_FPS = 15
FACE_STRIDE = 3
FACE_FPS = FRAME_FPS / FACE_STRIDE
# Sisi panjang frame analisis. Model wajah memperkecil masukan ke 192 px, jadi resolusi lebih
# besar hanya memperlambat decode.
ANALYSIS_LONG_SIDE = 640


@dataclass(frozen=True)
class FaceBox:
    """Kotak wajah dalam pecahan 0–1 lebar/tinggi frame, sehingga sama untuk proxy & sumber."""

    x: float
    y: float
    width: float
    height: float
    score: float


@dataclass(frozen=True)
class FaceSample:
    # Posisi di video sumber (ms), sama dengan waktu token transkrip.
    t_ms: int
    faces: tuple[FaceBox, ...]


@dataclass(frozen=True)
class ClipAnalysis:
    start_ms: int
    end_ms: int
    # Ukuran tampilan video sumber (rotasi sudah diterapkan).
    width: int
    height: int
    samples: tuple[FaceSample, ...]
    # Awal tiap adegan baru di dalam rentang klip (ms sumber, naik).
    scene_cuts_ms: tuple[int, ...]


def analysis_size(width: int, height: int, long_side: int = ANALYSIS_LONG_SIDE) -> tuple[int, int]:
    """Skala agar sisi panjang ≤ `long_side` (tanpa upscale); kedua sisi genap untuk ffmpeg."""
    scale = min(1.0, long_side / max(width, height))

    def even(value: float) -> int:
        return max(2, math.floor(value / 2 + 0.5) * 2)

    return even(width * scale), even(height * scale)


def expected_frames(start_ms: int, end_ms: int, fps: float = FRAME_FPS) -> int:
    return max(0, math.ceil((end_ms - start_ms) * fps / 1000))


def frame_time_ms(start_ms: int, index: int, fps: float = FRAME_FPS) -> int:
    """Waktu sumber frame ke-`index` (mulai 0) dari pembacaan `fps` sejak `start_ms`."""
    return start_ms + round(index * 1000 / fps)


def clamp_box(box: FaceBox) -> FaceBox | None:
    """Potong kotak ke dalam frame (detektor bisa melewati tepi); kosong setelahnya → `None`."""
    left, top = max(0.0, box.x), max(0.0, box.y)
    right, bottom = min(1.0, box.x + box.width), min(1.0, box.y + box.height)
    if right <= left or bottom <= top:
        return None
    if (left, top, right, bottom) == (box.x, box.y, box.x + box.width, box.y + box.height):
        return box
    return FaceBox(left, top, right - left, bottom - top, box.score)


def scene_cuts_ms(
    start_ms: int, end_ms: int, cut_frames: Iterable[int], fps: float = FRAME_FPS
) -> tuple[int, ...]:
    """Indeks frame awal adegan baru → waktu sumber, unik & naik, hanya yang di dalam klip."""
    times = {frame_time_ms(start_ms, frame, fps) for frame in cut_frames}
    return tuple(sorted(t for t in times if start_ms < t < end_ms))
