"""Port modul render."""

from collections.abc import Callable, Collection, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from clipstudio_worker.modules.render.domain.outputs import FinishedRender

# (tahap, bagian 0–1) dari renderer.
StageProgress = Callable[[str, float], None]


@dataclass(frozen=True)
class RenderRequest:
    # Path relatif terhadap direktori data.
    source_path: str
    output_path: str
    props: Mapping[str, Any]


class RenderError(Exception):
    """Render gagal; pesannya ditampilkan apa adanya ke pengguna."""


class ClipRenderer(Protocol):
    def render(self, request: RenderRequest, on_progress: StageProgress) -> int:
        """Render ke `output_path` (file akhir tidak pernah setengah jadi); kembalikan ukurannya
        dalam byte. Gagal → `RenderError`."""
        ...


class RenderHistory(Protocol):
    def finished_renders(self, project_id: str) -> Sequence[FinishedRender]:
        """Job render `done` milik proyek (hasil yang tidak terbaca dilewati)."""
        ...

    def clip_ids(self, project_id: str) -> Collection[str]:
        """Klip yang masih ada di proyek."""
        ...


class RenderFiles(Protocol):
    def remove(self, path: str) -> None:
        """Hapus file (relatif terhadap direktori data); file yang tidak ada diabaikan. Galat hanya
        dicatat: pembersihan tidak boleh menggagalkan render yang sudah berhasil."""
        ...
