"""Port modul reframe. Path = relatif terhadap direktori data, format POSIX."""

from collections.abc import Generator, Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol

import numpy as np
import numpy.typing as npt

from clipstudio_worker.modules.reframe.domain.analysis import ClipAnalysis, FaceBox
from clipstudio_worker.modules.reframe.domain.crop import CropKeyframe

# Frame RGB: tinggi × lebar × 3, uint8.
Frame = npt.NDArray[np.uint8]


@dataclass(frozen=True)
class ClipVideo:
    clip_id: str
    start_ms: int
    end_ms: int
    # Proxy bila ada (decode lebih cepat; koordinat wajah ternormalisasi), selain itu sumber.
    video_path: str
    # Ukuran tampilan video sumber; `None` bila ingest belum selesai.
    width: int | None
    height: int | None


class ReframeError(Exception):
    """Klip tidak bisa dianalisis; pesannya ditampilkan apa adanya ke pengguna."""


@dataclass(frozen=True)
class StoredReframe:
    # Versi algoritma deteksi; rentang klip ada di `analysis`.
    version: int
    analysis: ClipAnalysis
    # Versi algoritma crop; `None` = crop belum pernah dihitung.
    crop_version: int | None


class ReframeRepository(Protocol):
    def clip_video(self, clip_id: str) -> ClipVideo | None:
        """Klip + video sumbernya; `None` bila klip sudah tidak ada."""
        ...

    def stored(self, clip_id: str) -> StoredReframe | None: ...

    def save(
        self,
        clip_id: str,
        version: int,
        analysis: ClipAnalysis,
        crop_version: int,
        crops: Mapping[str, Sequence[CropKeyframe]],
    ) -> bool:
        """Simpan (timpa) analisis & crop klip; `False` bila klip sudah dihapus."""
        ...


class FrameReader(Protocol):
    def read(
        self, path: str, start_ms: int, end_ms: int, fps: float, size: tuple[int, int]
    ) -> Generator[Frame, None, None]:
        """Frame `start_ms`–`end_ms` dengan laju tetap `fps`, diskalakan ke `size` (lebar, tinggi).
        Gagal → `ReframeError`. Ditutup (`close`) sebelum habis → pembacaan dihentikan."""
        ...


class FaceDetector(Protocol):
    def detect(self, frame: Frame) -> list[FaceBox]:
        """Wajah di frame, koordinat ternormalisasi. Model tidak tersedia → `ReframeError`."""
        ...


class SceneCutSession(Protocol):
    def push(self, frame: Frame) -> None:
        """Frame berikutnya (berurutan, laju tetap)."""
        ...

    def finish(self) -> list[int]:
        """Indeks frame (mulai 0) yang memulai adegan baru."""
        ...


class SceneCutDetector(Protocol):
    def start(self, fps: float) -> SceneCutSession: ...
