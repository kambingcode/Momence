"""Pembersihan MP4 hasil render yang sudah tidak dibutuhkan."""

import posixpath
from collections.abc import Collection, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class FinishedRender:
    """Job render yang sudah selesai beserta file hasilnya (relatif terhadap direktori data)."""

    job_id: str
    clip_id: str
    output_path: str


def is_render_output(path: str) -> bool:
    """Hanya `media/<proyek>/renders/<job>.mp4` yang boleh dihapus pembersihan; path lain dari
    hasil job (data rusak/asing) dibiarkan."""
    parts = path.split("/")
    return (
        len(parts) == 4
        and parts[0] == "media"
        and parts[2] == "renders"
        and parts[3].endswith(".mp4")
        and all(part not in ("", ".", "..") for part in parts)
        and posixpath.normpath(path) == path
    )


def superseded_outputs(
    renders: Sequence[FinishedRender],
    *,
    clip_id: str,
    keep_path: str,
    existing_clip_ids: Collection[str],
) -> list[str]:
    """File yang dihapus setelah render baru klip `clip_id` (file `keep_path`) berhasil: render
    lama klip yang sama (hanya yang terbaru disimpan) dan render klip yang sudah tidak ada (dibuang
    discover ulang). Render klip lain yang masih ada tidak disentuh."""
    stale = (
        r.output_path
        for r in renders
        if r.output_path != keep_path
        and (r.clip_id == clip_id or r.clip_id not in existing_clip_ids)
        and is_render_output(r.output_path)
    )
    return sorted(set(stale))
