from dataclasses import dataclass

from clipstudio_worker.modules.projects.application.ports import (
    IngestedSources,
    MediaFolder,
    ThumbnailMaker,
)
from clipstudio_worker.modules.projects.domain.thumbnail import (
    THUMBNAIL_WIDTH,
    ThumbnailError,
    thumbnail_offset_ms,
    thumbnail_path,
)


def make_thumbnail(thumbnails: ThumbnailMaker, media_path: str, duration_ms: int) -> str | None:
    """Buat thumbnail di folder `media_path`; mengembalikan path-nya, atau `None` bila gagal."""
    target = thumbnail_path(media_path)
    try:
        thumbnails.make(media_path, target, thumbnail_offset_ms(duration_ms), THUMBNAIL_WIDTH)
    except ThumbnailError:
        return None
    return target


@dataclass(frozen=True)
class BackfillResult:
    created: int
    failed: int


class BackfillThumbnails:
    """Buat thumbnail untuk proyek yang sudah di-ingest sebelum fitur ini ada. Dijalankan saat
    worker mulai; proyek yang sudah punya thumbnail dilewati, jadi aman diulang."""

    def __init__(
        self, sources: IngestedSources, media: MediaFolder, thumbnails: ThumbnailMaker
    ) -> None:
        self._sources = sources
        self._media = media
        self._thumbnails = thumbnails

    def __call__(self) -> BackfillResult:
        existing = {entry.path for entry in self._media.files()}
        created = failed = 0
        done: set[str] = set()
        for source in self._sources.list_ingested():
            if source.proxy_path is None or source.duration_ms is None:
                continue
            target = thumbnail_path(source.proxy_path)
            if target in existing or target in done:
                continue
            done.add(target)
            if make_thumbnail(self._thumbnails, source.proxy_path, source.duration_ms):
                created += 1
            else:
                failed += 1
        return BackfillResult(created, failed)
