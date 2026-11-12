import importlib
import shutil
import threading
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from clipstudio_worker.modules.projects.application import (
    AudioDownloader,
    DownloadedAudio,
    DownloadedVideo,
    StepProgress,
    VideoDownloader,
    VideoDownloadError,
)
from clipstudio_worker.modules.projects.domain.download import (
    download_failure_message,
    insufficient_disk_message,
)
from clipstudio_worker.shared.paths import resolve_data_path

# Sisi terpendek maksimum (1080p landscape, 1080×1920 untuk Shorts portrait).
MAX_RESOLUTION = 1080
# Video + audio terbaik; `res` yt-dlp = sisi terpendek, sehingga format ≤ 1080 diutamakan (lebih
# besar hanya bila tidak ada yang lebih kecil). H.264/AAC (MP4) diutamakan agar penggabungan cukup
# remux dan hasilnya diputar Chrome (Remotion) tanpa masalah.
_FORMAT = "bv*+ba/b"


def _format_sort(max_resolution: int) -> list[str]:
    return [f"res:{max_resolution}", "vcodec:h264", "acodec:aac", "ext:mp4:m4a"]


# Hanya suara: format audio-only terbaik; bila situs tak punya, format gabungan terkecil (suara
# diambil darinya). Cukup untuk Whisper, ukurannya puluhan MB untuk stream berjam-jam.
_AUDIO_FORMAT = "ba/wa/w"


def _expected_bytes(info: Mapping[str, Any]) -> int:
    """Perkiraan total byte semua format yang akan diunduh (0 bila yt-dlp tidak tahu ukurannya)."""
    formats: list[Mapping[str, Any]] = info.get("requested_formats") or [info]
    return sum(int(f.get("filesize") or f.get("filesize_approx") or 0) for f in formats)


def estimated_bytes(info: Mapping[str, Any]) -> int:
    """Seperti `_expected_bytes`, tetapi format HLS (VOD Twitch) yang tanpa ukuran diperkirakan
    dari bitrate rata-rata (`tbr`, kbit/s) × durasi video."""
    duration = float(info.get("duration") or 0)
    formats: list[Mapping[str, Any]] = info.get("requested_formats") or [info]
    total = 0
    for fmt in formats:
        size = int(fmt.get("filesize") or fmt.get("filesize_approx") or 0)
        if size <= 0:
            tbr = float(fmt.get("tbr") or 0)
            size = int(tbr * 1000 / 8 * duration)
        total += size
    return total


def _free_disk_bytes(folder: Path) -> int:
    return shutil.disk_usage(folder).free


def _module(name: str) -> Any:
    # yt_dlp tidak punya anotasi tipe; diimpor saat dipakai agar `worker --help` tetap cepat.
    return importlib.import_module(name)


class DownloadProgress:
    """Hook progres yt-dlp → pecahan 0.0–1.0 untuk seluruh unduhan (video + audio terpisah).

    Total = jumlah ukuran format yang diminta; nilainya tidak pernah turun walau ukuran awal hanya
    perkiraan. Dengan unduhan fragmen paralel, yt-dlp memanggil hook dari beberapa thread sekaligus
    (dan `downloaded_bytes` bisa sedikit mundur), jadi seluruh perhitungan dijaga satu kunci.
    """

    def __init__(self, on_progress: StepProgress) -> None:
        self._on_progress = on_progress
        self._finished: dict[str, int] = {}
        self._last = 0.0
        self._lock = threading.Lock()

    def __call__(self, status: Mapping[str, Any]) -> None:
        state = status.get("status")
        if state not in ("downloading", "finished"):
            return
        with self._lock:
            self._update(state, status)

    def _update(self, state: str, status: Mapping[str, Any]) -> None:
        filename = str(status.get("filename", ""))
        downloaded = int(status.get("downloaded_bytes") or 0)
        file_total = int(
            status.get("total_bytes") or status.get("total_bytes_estimate") or downloaded
        )
        earlier = sum(size for name, size in self._finished.items() if name != filename)
        if state == "finished":
            self._finished[filename] = file_total

        info: Mapping[str, Any] = status.get("info_dict") or {}
        total = max(_expected_bytes(info), earlier + file_total)
        if total <= 0:
            return
        fraction = min((earlier + downloaded) / total, 1.0)
        if fraction > self._last:
            self._last = fraction
            self._on_progress(fraction)


class YtDlpVideoDownloader(VideoDownloader, AudioDownloader):
    """Adapter yt-dlp (YouTube & VOD Twitch). Path dari application relatif terhadap `data_dir`;
    ffmpeg dipakai yt-dlp untuk menggabungkan video & audio, Node untuk tantangan JavaScript
    YouTube. Sebelum mengunduh, ukuran perkiraan dibandingkan dengan ruang kosong disk agar stream
    berjam-jam gagal cepat, bukan di tengah unduhan. `concurrent_fragments` = jumlah fragmen
    HLS/DASH yang diunduh bersamaan (VOD Twitch satu koneksi hanya ±3 MB/s)."""

    def __init__(
        self,
        data_dir: Path,
        node: str = "node",
        free_bytes: Callable[[Path], int] = _free_disk_bytes,
        concurrent_fragments: int = 1,
    ) -> None:
        if concurrent_fragments < 1:
            raise ValueError("concurrent_fragments minimal 1")
        self._data_dir = data_dir
        self._node = node
        self._free_bytes = free_bytes
        self._concurrent_fragments = concurrent_fragments

    def download(
        self,
        url: str,
        target: str,
        on_progress: StepProgress,
        max_resolution: int | None = None,
    ) -> DownloadedVideo:
        final = resolve_data_path(self._data_dir, target)
        final.parent.mkdir(parents=True, exist_ok=True)
        # Semua file sementara yt-dlp (.part, format terpisah) memakai awalan ini.
        stem = f".{final.stem}.download"
        self._remove_leftovers(final.parent, stem)

        yt_dlp = _module("yt_dlp")
        options: dict[str, Any] = {
            **self._common_options(final.parent / f"{stem}.%(ext)s", on_progress),
            "format": _FORMAT,
            "format_sort": _format_sort(max_resolution or MAX_RESOLUTION),
            "merge_output_format": "mp4",
            "postprocessors": [{"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"}],
        }
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info: Mapping[str, Any] = ydl.extract_info(url, download=False)
                if info.get("is_live"):
                    raise VideoDownloadError(
                        "Siaran langsung yang masih berjalan tidak bisa diimpor; tunggu sampai "
                        "selesai."
                    )
                if info.get("_type") == "playlist":
                    raise VideoDownloadError("Link playlist tidak didukung.")
                low_disk = insufficient_disk_message(
                    estimated_bytes(info), self._free_bytes(final.parent)
                )
                if low_disk:
                    raise VideoDownloadError(low_disk)
                info = ydl.process_ie_result(info, download=True)
        except _module("yt_dlp.utils").DownloadError as exc:
            self._remove_leftovers(final.parent, stem)
            raise VideoDownloadError(download_failure_message(str(exc))) from exc
        except BaseException:
            self._remove_leftovers(final.parent, stem)
            raise

        downloaded = final.parent / f"{stem}.mp4"
        if not downloaded.is_file():
            self._remove_leftovers(final.parent, stem)
            raise VideoDownloadError("Gagal mengunduh video: file hasil tidak ditemukan.")
        downloaded.replace(final)
        self._remove_leftovers(final.parent, stem)
        on_progress(1.0)
        title = info.get("title")
        return DownloadedVideo(
            title=title if isinstance(title, str) else None, size_bytes=final.stat().st_size
        )

    def download_audio(self, url: str, target: str, on_progress: StepProgress) -> DownloadedAudio:
        final = resolve_data_path(self._data_dir, target)
        final.parent.mkdir(parents=True, exist_ok=True)
        # Awalan lain dari unduhan video: keduanya bisa berjalan bersamaan di folder yang sama.
        stem = f".{final.stem}.audio-download"
        self._remove_leftovers(final.parent, stem)

        yt_dlp = _module("yt_dlp")
        options: dict[str, Any] = {
            **self._common_options(final.parent / f"{stem}.%(ext)s", on_progress),
            "format": _AUDIO_FORMAT,
            # WAV PCM 16 kHz mono = masukan Whisper (sama dengan `MediaProcessor.extract_audio`).
            "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}],
            "postprocessor_args": {"extractaudio": ["-ac", "1", "-ar", "16000"]},
        }
        try:
            with yt_dlp.YoutubeDL(options) as ydl:
                info: Mapping[str, Any] = ydl.extract_info(url, download=False)
                if info.get("is_live"):
                    raise VideoDownloadError(
                        "Siaran langsung yang masih berjalan tidak bisa diimpor; tunggu sampai "
                        "selesai."
                    )
                if info.get("_type") == "playlist":
                    raise VideoDownloadError("Link playlist tidak didukung.")
                info = ydl.process_ie_result(info, download=True)
        except _module("yt_dlp.utils").DownloadError as exc:
            self._remove_leftovers(final.parent, stem)
            raise VideoDownloadError(download_failure_message(str(exc))) from exc
        except BaseException:
            self._remove_leftovers(final.parent, stem)
            raise

        downloaded = final.parent / f"{stem}.wav"
        if not downloaded.is_file():
            self._remove_leftovers(final.parent, stem)
            raise VideoDownloadError("Gagal mengunduh audio: file hasil tidak ditemukan.")
        downloaded.replace(final)
        self._remove_leftovers(final.parent, stem)
        on_progress(1.0)
        title = info.get("title")
        return DownloadedAudio(title=title if isinstance(title, str) else None)

    def _common_options(self, outtmpl: Path, on_progress: StepProgress) -> dict[str, Any]:
        return {
            "outtmpl": str(outtmpl),
            "noplaylist": True,
            "overwrites": True,
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "concurrent_fragment_downloads": self._concurrent_fragments,
            "progress_hooks": [DownloadProgress(on_progress)],
            "js_runtimes": {"node": {"path": shutil.which(self._node) or self._node}},
        }

    @staticmethod
    def _remove_leftovers(folder: Path, stem: str) -> None:
        for leftover in folder.glob(f"{stem}.*"):
            leftover.unlink(missing_ok=True)
