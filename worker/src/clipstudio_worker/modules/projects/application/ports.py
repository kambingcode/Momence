"""Port modul projects. Semua path = relatif terhadap direktori data, format POSIX."""

from collections.abc import Callable, Collection, Sequence
from dataclasses import dataclass
from typing import Protocol

from clipstudio_worker.modules.projects.domain.cleanup import MediaEntry
from clipstudio_worker.modules.projects.domain.media import MediaInfo

# Menerima pecahan 0.0–1.0 dari langkah yang sedang berjalan.
StepProgress = Callable[[float], None]


@dataclass(frozen=True)
class SourceRecord:
    id: str
    project_id: str
    path: str
    # Terisi setelah ingest selesai.
    audio_path: str | None = None
    proxy_path: str | None = None
    duration_ms: int | None = None


class SourceRepository(Protocol):
    def get(self, source_id: str) -> SourceRecord | None: ...

    def save_audio(
        self, source_id: str, duration_ms: int, audio_path: str, project_name: str | None
    ) -> None:
        """Audio WAV siap (bahan transkripsi) sebelum video selesai diproses; `project_name`
        (judul video) bila diketahui."""
        ...

    def save_media(
        self, source_id: str, info: MediaInfo, audio_path: str, proxy_path: str
    ) -> None: ...

    def save_download(self, source_id: str, size_bytes: int, project_name: str) -> None:
        """Ukuran video sumber yang selesai diunduh + nama proyek (judul video)."""
        ...


class IngestedSources(Protocol):
    def list_ingested(self) -> Sequence[SourceRecord]:
        """Sumber yang sudah selesai di-ingest (proxy & durasi terisi)."""
        ...


@dataclass(frozen=True)
class DownloadedVideo:
    title: str | None
    size_bytes: int


class VideoDownloader(Protocol):
    def download(
        self,
        url: str,
        target: str,
        on_progress: StepProgress,
        max_resolution: int | None = None,
    ) -> DownloadedVideo:
        """Unduh satu video ke `target` sebagai MP4 dengan sisi terpendek ≤ `max_resolution`
        (None = bawaan 1080); menimpa file lama. Melempar `VideoDownloadError` (pesan untuk
        pengguna) bila video tidak bisa diunduh."""
        ...


@dataclass(frozen=True)
class DownloadedAudio:
    title: str | None


class AudioDownloader(Protocol):
    def download_audio(self, url: str, target: str, on_progress: StepProgress) -> DownloadedAudio:
        """Unduh hanya suara video sebagai WAV PCM 16 kHz mono ke `target` (masukan Whisper);
        menimpa file lama. Melempar `VideoDownloadError` bila tidak bisa diunduh."""
        ...


class SourceClips(Protocol):
    def clip_ids(self, source_id: str) -> list[str]:
        """Klip hasil discover untuk video sumber ini (kosong bila discover belum selesai)."""
        ...


class MediaProcessor(Protocol):
    def probe(self, path: str) -> MediaInfo: ...

    def audio_duration_ms(self, path: str) -> int:
        """Durasi file audio; melempar `UnsupportedMediaError` bila tidak terbaca."""
        ...

    def extract_audio(
        self, source: str, target: str, duration_ms: int, on_progress: StepProgress
    ) -> None:
        """WAV PCM 16 kHz mono (masukan Whisper)."""
        ...

    def make_proxy(
        self,
        source: str,
        target: str,
        size: tuple[int, int],
        frame_rate: float | None,
        duration_ms: int,
        on_progress: StepProgress,
    ) -> None:
        """MP4 H.264 + AAC untuk pratinjau di browser; `frame_rate` None = sama dengan sumber."""
        ...


class ThumbnailMaker(Protocol):
    def make(self, source: str, target: str, at_ms: int, width: int) -> None:
        """JPEG satu frame dari `source` pada detik `at_ms`, lebar `width` px (tinggi mengikuti
        rasio); menimpa file lama. Melempar `ThumbnailError` bila gagal."""
        ...


class ProjectIndex(Protocol):
    def project_ids(self) -> Collection[str]:
        """Semua proyek yang masih ada."""
        ...


class MediaFolder(Protocol):
    def project_dirs(self) -> Sequence[MediaEntry]:
        """Folder langsung di bawah `media/`."""
        ...

    def files(self) -> Sequence[MediaEntry]:
        """Semua file di bawah `media/` (rekursif)."""
        ...

    def remove(self, path: str) -> int:
        """Hapus file/folder (rekursif); mengembalikan byte yang dibebaskan. Galat hanya dicatat
        (0 byte)."""
        ...
