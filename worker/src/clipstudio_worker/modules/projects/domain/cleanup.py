"""Bersih-bersih folder media: apa yang aman dihapus saat worker mulai."""

import re
from collections.abc import Collection, Sequence
from dataclasses import dataclass

# Umur minimal sebelum dihapus. Folder unggahan dibuat sebelum baris proyeknya (web menulis file
# dulu) dan file `.part` sedang ditulis selama job/unggahan berjalan; keduanya jauh di bawah ini.
STALE_AFTER_MS = 24 * 60 * 60 * 1000

# File sementara: unggahan web `source.mp4.part`, ffmpeg `.proxy.mp4.<pid>.part`,
# Remotion `.<job>.<pid>.part.mp4`.
_PARTIAL = re.compile(r"\.part(\.[A-Za-z0-9]+)?$")


@dataclass(frozen=True)
class MediaEntry:
    # Relatif terhadap direktori data, format POSIX.
    path: str
    modified_ms: int


@dataclass(frozen=True)
class CleanupPlan:
    # Folder `media/<id>` yang tidak punya baris proyek.
    orphan_dirs: list[str]
    partial_files: list[str]


def is_partial_file(name: str) -> bool:
    return bool(_PARTIAL.search(name))


def plan_cleanup(
    project_dirs: Sequence[MediaEntry],
    files: Sequence[MediaEntry],
    project_ids: Collection[str],
    now_ms: int,
) -> CleanupPlan:
    """`project_dirs` = folder langsung di bawah `media/`; `files` = semua file di dalamnya."""

    def stale(entry: MediaEntry) -> bool:
        return now_ms - entry.modified_ms >= STALE_AFTER_MS

    orphans = [
        d.path for d in project_dirs if d.path.rsplit("/", 1)[-1] not in project_ids and stale(d)
    ]
    inside_orphan = tuple(f"{d}/" for d in orphans)
    partials = [
        f.path
        for f in files
        if is_partial_file(f.path.rsplit("/", 1)[-1])
        and stale(f)
        and not f.path.startswith(inside_orphan)
    ]
    return CleanupPlan(orphan_dirs=sorted(orphans), partial_files=sorted(partials))
