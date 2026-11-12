import subprocess
import threading
from collections import deque
from collections.abc import Generator
from pathlib import Path
from typing import IO

import numpy as np

from clipstudio_worker.modules.reframe.application import Frame, FrameReader, ReframeError
from clipstudio_worker.shared.paths import resolve_data_path

_STDERR_TAIL = 8


class FfmpegFrameReader(FrameReader):
    """Decode rentang video jadi frame RGB mentah lewat pipe ffmpeg. Path dari application relatif
    terhadap `data_dir`."""

    def __init__(self, data_dir: Path, ffmpeg: str = "ffmpeg") -> None:
        self._data_dir = data_dir
        self._ffmpeg = ffmpeg

    def read(
        self, path: str, start_ms: int, end_ms: int, fps: float, size: tuple[int, int]
    ) -> Generator[Frame, None, None]:
        video = resolve_data_path(self._data_dir, path)
        if not video.is_file():
            raise ReframeError("Video sumber tidak ditemukan (proyek mungkin sudah dihapus).")
        width, height = size
        command = [
            self._ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin",
            # -ss sebelum -i: seek cepat ke keyframe lalu decode akurat sampai `start_ms`.
            "-ss", f"{start_ms / 1000:.3f}", "-i", str(video),
            "-t", f"{(end_ms - start_ms) / 1000:.3f}",
            "-map", "0:v:0", "-an", "-sn",
            "-vf", f"fps={fps},scale={width}:{height}",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
        ]  # fmt: skip
        frame_bytes = width * height * 3
        stderr_tail: deque[str] = deque(maxlen=_STDERR_TAIL)
        try:
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except FileNotFoundError as exc:
            raise ReframeError(f"ffmpeg ({self._ffmpeg}) tidak ditemukan.") from exc
        assert process.stdout is not None and process.stderr is not None
        # Stderr dikuras di thread terpisah agar pipe-nya tidak penuh dan ffmpeg macet.
        drain = threading.Thread(target=_collect, args=(process.stderr, stderr_tail), daemon=True)
        drain.start()
        finished = False
        try:
            while True:
                data = process.stdout.read(frame_bytes)
                if len(data) < frame_bytes:
                    break
                yield np.frombuffer(data, dtype=np.uint8).reshape(height, width, 3)
            finished = True
        finally:
            # Pemakai berhenti lebih awal (atau error) → hentikan ffmpeg agar tidak menggantung.
            if not finished:
                process.kill()
            returncode = process.wait()
            process.stdout.close()
            drain.join()
            process.stderr.close()
        if returncode != 0:
            detail = " | ".join(stderr_tail) or f"kode keluar {returncode}"
            raise ReframeError(f"ffmpeg gagal membaca video: {detail}")


def _collect(stream: IO[bytes], tail: deque[str]) -> None:
    for line in stream:
        text = line.decode(errors="replace").strip()
        if text:
            tail.append(text)
