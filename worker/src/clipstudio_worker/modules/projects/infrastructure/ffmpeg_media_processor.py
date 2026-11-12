import json
import os
import subprocess
from collections import deque
from pathlib import Path
from typing import Any

from clipstudio_worker.modules.projects.application import (
    MediaInfo,
    MediaProcessor,
    StepProgress,
    ThumbnailError,
    ThumbnailMaker,
    UnsupportedMediaError,
)
from clipstudio_worker.modules.projects.domain.media import display_size, parse_frame_rate
from clipstudio_worker.shared.paths import resolve_data_path


class FfmpegError(RuntimeError):
    pass


class FfmpegMediaProcessor(MediaProcessor, ThumbnailMaker):
    """Adapter ffprobe/ffmpeg. Path dari application relatif terhadap `data_dir`."""

    def __init__(self, data_dir: Path, ffmpeg: str = "ffmpeg", ffprobe: str = "ffprobe") -> None:
        self._data_dir = data_dir
        self._ffmpeg = ffmpeg
        self._ffprobe = ffprobe

    def probe(self, path: str) -> MediaInfo:
        result = subprocess.run(
            [
                self._ffprobe,
                "-v", "error",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                str(self._resolve(path)),
            ],
            capture_output=True,
            text=True,
            check=False,
        )  # fmt: skip
        if result.returncode != 0:
            raise UnsupportedMediaError(f"ffprobe gagal membaca file: {result.stderr.strip()}")
        data: dict[str, Any] = json.loads(result.stdout)
        streams: list[dict[str, Any]] = data.get("streams", [])

        video = next(
            (
                s
                for s in streams
                if s.get("codec_type") == "video"
                and not s.get("disposition", {}).get("attached_pic")
            ),
            None,
        )
        if video is None:
            raise UnsupportedMediaError("File tidak berisi trek video.")

        width, height = display_size(
            int(video.get("width", 0)), int(video.get("height", 0)), _rotation(video)
        )
        duration = data.get("format", {}).get("duration") or video.get("duration") or 0
        return MediaInfo(
            duration_ms=round(float(duration) * 1000),
            width=width,
            height=height,
            fps=parse_frame_rate(video.get("avg_frame_rate"))
            or parse_frame_rate(video.get("r_frame_rate")),
            has_audio=any(s.get("codec_type") == "audio" for s in streams),
        )

    def audio_duration_ms(self, path: str) -> int:
        result = subprocess.run(
            [
                self._ffprobe,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "csv=p=0",
                str(self._resolve(path)),
            ],
            capture_output=True,
            text=True,
            check=False,
        )  # fmt: skip
        try:
            duration = float(result.stdout.strip())
        except ValueError:
            duration = 0.0
        if result.returncode != 0 or duration <= 0:
            raise UnsupportedMediaError(
                f"Durasi audio tidak terbaca: {result.stderr.strip() or 'file kosong'}"
            )
        return round(duration * 1000)

    def extract_audio(
        self, source: str, target: str, duration_ms: int, on_progress: StepProgress
    ) -> None:
        self._run_to(
            target,
            "wav",
            ["-i", str(self._resolve(source)), "-map", "0:a:0", "-vn",
             "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"],
            duration_ms,
            on_progress,
        )  # fmt: skip

    def make_proxy(
        self,
        source: str,
        target: str,
        size: tuple[int, int],
        frame_rate: float | None,
        duration_ms: int,
        on_progress: StepProgress,
    ) -> None:
        width, height = size
        fps_filter = f"fps={frame_rate:g}," if frame_rate else ""
        self._run_to(
            target,
            "mp4",
            [
                "-i", str(self._resolve(source)),
                "-map", "0:v:0", "-map", "0:a:0?",
                # ffmpeg menerapkan rotasi otomatis, jadi ukuran = ukuran tampilan.
                "-vf", f"{fps_filter}scale={width}:{height},format=yuv420p",
                # Hanya untuk pratinjau & analisis wajah: bitrate dibatasi agar hemat ruang
                # (uji 720p 2 menit: 24,4 → 17,5 MB, tampilan sama). Render memakai sumber asli.
                # `superfast` (T17.2, VOD 1080p60 10 mnt → 720p30): 27,6 → 22,8 dtk, SSIM
                # 0,985 → 0,984. h264_videotoolbox diukur 2× lebih lambat dari x264 di M4 Pro
                # (±455 fps 720p, x264 memakai semua core), jadi tidak dipakai.
                "-c:v", "libx264", "-preset", "superfast", "-crf", "26",
                "-maxrate", "1500k", "-bufsize", "3000k",
                # Keyframe tiap detik agar seek di pratinjau cepat.
                "-force_key_frames", "expr:gte(t,n_forced*1)",
                "-c:a", "aac", "-b:a", "96k", "-ac", "2",
                "-movflags", "+faststart",
            ],
            duration_ms,
            on_progress,
        )  # fmt: skip

    def make(self, source: str, target: str, at_ms: int, width: int) -> None:
        try:
            self._run_to(
                target,
                "mjpeg",
                [
                    # -ss sebelum -i: lompat lewat keyframe, cepat bahkan untuk sumber panjang.
                    "-ss", f"{at_ms / 1000:.3f}", "-i", str(self._resolve(source)),
                    "-map", "0:v:0", "-frames:v", "1", "-an",
                    "-vf", f"scale=w='min({width},iw)':h=-2,format=yuvj420p",
                    "-q:v", "4",
                ],
                0,
                lambda _: None,
            )  # fmt: skip
            # `-ss` melewati akhir video (proxy bisa sedikit lebih pendek dari durasi sumber):
            # ffmpeg sukses tanpa menulis frame, hasilnya file kosong.
            final = self._resolve(target)
            if final.stat().st_size == 0:
                final.unlink()
                raise ThumbnailError("Thumbnail gagal dibuat: tidak ada frame pada detik itu.")
        except (FfmpegError, OSError) as exc:
            raise ThumbnailError(f"Thumbnail gagal dibuat: {exc}") from exc

    def _run_to(
        self,
        target: str,
        fmt: str,
        args: list[str],
        duration_ms: int,
        on_progress: StepProgress,
    ) -> None:
        final = self._resolve(target)
        final.parent.mkdir(parents=True, exist_ok=True)
        # Tulis ke file sementara lalu rename: file akhir tidak pernah setengah jadi.
        # PID di nama: ffmpeg milik worker yang dimatikan paksa bisa masih menulis file
        # sementaranya sendiri; percobaan ulang tidak boleh menulis ke file yang sama.
        partial = final.with_name(f".{final.name}.{os.getpid()}.part")
        command = [
            self._ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
            "-progress", "pipe:1", "-nostats",
            *args, "-f", fmt, str(partial),
        ]  # fmt: skip
        stderr_tail: deque[str] = deque(maxlen=20)
        try:
            with subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            ) as process:
                assert process.stdout is not None and process.stderr is not None
                for line in process.stdout:
                    key, _, value = line.strip().partition("=")
                    if key == "out_time_us" and value.isdigit() and duration_ms > 0:
                        on_progress(min(1.0, int(value) / 1000 / duration_ms))
                stderr_tail.extend(process.stderr.read().splitlines())
                returncode = process.wait()
            if returncode != 0:
                raise FfmpegError(f"ffmpeg gagal ({returncode}): {' | '.join(stderr_tail)}")
            os.replace(partial, final)
        finally:
            partial.unlink(missing_ok=True)
        on_progress(1.0)

    def _resolve(self, relative: str) -> Path:
        return resolve_data_path(self._data_dir, relative)


def _rotation(stream: dict[str, Any]) -> float:
    for side_data in stream.get("side_data_list", []):
        if "rotation" in side_data:
            return float(side_data["rotation"])
    return float(stream.get("tags", {}).get("rotate", 0))
