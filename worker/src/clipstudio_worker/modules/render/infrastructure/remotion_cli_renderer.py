import json
import os
import subprocess
import threading
from collections import deque
from pathlib import Path
from typing import IO, Any, cast

from clipstudio_worker.modules.render.application import (
    ClipRenderer,
    RenderError,
    RenderRequest,
    StageProgress,
)
from clipstudio_worker.shared.paths import resolve_data_path

# Skrip render di web (Remotion), dijalankan dengan Node yang membaca TypeScript langsung.
RENDER_SCRIPT = Path("scripts") / "render-clip.mts"
_STDERR_TAIL = 8


def parse_progress(line: str) -> tuple[str, float] | None:
    """Baris progres `{"stage": ..., "progress": 0..1}` dari skrip; baris lain → `None`."""
    try:
        parsed: Any = json.loads(line)
    except ValueError:
        return None
    if not isinstance(parsed, dict):
        return None
    event = cast(dict[str, Any], parsed)
    stage, progress = event.get("stage"), event.get("progress")
    if not isinstance(stage, str) or not isinstance(progress, int | float):
        return None
    return stage, float(progress)


class RemotionCliRenderer(ClipRenderer):
    """Adapter `ClipRenderer`: jalankan `web/scripts/render-clip.mts` sebagai subproses Node.
    Path dari application relatif terhadap `data_dir`."""

    def __init__(self, data_dir: Path, web_dir: Path, node: str = "node") -> None:
        self._data_dir = data_dir
        self._web_dir = web_dir
        self._node = node

    def render(self, request: RenderRequest, on_progress: StageProgress) -> int:
        source = resolve_data_path(self._data_dir, request.source_path)
        if not source.is_file():
            raise RenderError("Video sumber tidak ditemukan (proyek mungkin sudah dihapus).")
        final = resolve_data_path(self._data_dir, request.output_path)
        final.parent.mkdir(parents=True, exist_ok=True)
        # File sementara lalu rename: file akhir tidak pernah setengah jadi. Berakhiran .mp4
        # karena Remotion memeriksa ekstensi sesuai codec.
        # PID di nama: bila worker sebelumnya dimatikan paksa, proses Node-nya bisa masih menulis
        # file sementaranya sendiri; percobaan ulang tidak boleh menulis ke file yang sama.
        partial = final.with_name(f".{final.stem}.{os.getpid()}.part{final.suffix}")
        body = json.dumps(
            {"sourcePath": str(source), "outputPath": str(partial), "props": request.props}
        )
        try:
            returncode, stderr_tail = self._run(body, on_progress)
            if returncode != 0:
                detail = " | ".join(stderr_tail) or f"kode keluar {returncode}"
                raise RenderError(f"Render gagal: {detail}")
            if not partial.is_file():
                raise RenderError("Render selesai tanpa menghasilkan file.")
            os.replace(partial, final)
        finally:
            partial.unlink(missing_ok=True)
        return final.stat().st_size

    def _run(self, body: str, on_progress: StageProgress) -> tuple[int, list[str]]:
        stderr_tail: deque[str] = deque(maxlen=_STDERR_TAIL)
        try:
            process = subprocess.Popen(
                [self._node, str(RENDER_SCRIPT)],
                cwd=self._web_dir,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except FileNotFoundError as exc:
            raise RenderError(
                f"Node.js ({self._node}) tidak ditemukan. Pasang Node atau set CLIPSTUDIO_NODE."
            ) from exc
        with process:
            assert process.stdin and process.stdout and process.stderr
            # Stderr dikuras di thread terpisah: log Remotion yang panjang tidak boleh memenuhi
            # pipe dan membuat subproses macet.
            drain = threading.Thread(
                target=_collect, args=(process.stderr, stderr_tail), daemon=True
            )
            drain.start()
            process.stdin.write(body)
            process.stdin.close()
            for line in process.stdout:
                event = parse_progress(line)
                if event is not None:
                    on_progress(*event)
            returncode = process.wait()
            drain.join()
        return returncode, list(stderr_tail)


def _collect(stream: IO[str], tail: deque[str]) -> None:
    for line in stream:
        if line.strip():
            tail.append(line.strip())
