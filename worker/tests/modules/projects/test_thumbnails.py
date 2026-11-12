from collections.abc import Sequence

from clipstudio_worker.modules.projects.application import (
    BackfillThumbnails,
    IngestedSources,
    MediaEntry,
    MediaFolder,
    SourceRecord,
    ThumbnailError,
    ThumbnailMaker,
)
from clipstudio_worker.modules.projects.domain.thumbnail import thumbnail_offset_ms, thumbnail_path


def test_thumbnail_sits_next_to_its_media() -> None:
    assert thumbnail_path("media/p1/proxy.mp4") == "media/p1/thumb.jpg"


def test_offset_is_ten_percent_with_one_second_minimum() -> None:
    assert thumbnail_offset_ms(600_000) == 60_000
    assert thumbnail_offset_ms(60_000) == 6_000
    assert thumbnail_offset_ms(5_000) == 1_000


def test_offset_for_clips_shorter_than_a_second_is_the_middle() -> None:
    assert thumbnail_offset_ms(1_000) == 500
    assert thumbnail_offset_ms(800) == 400
    assert thumbnail_offset_ms(0) == 0


def record(source_id: str, proxy: str | None, duration: int | None = 60_000) -> SourceRecord:
    return SourceRecord(
        id=source_id,
        project_id=source_id,
        path="media/x/source.mp4",
        proxy_path=proxy,
        duration_ms=duration,
    )


class FakeSources(IngestedSources):
    def __init__(self, records: list[SourceRecord]) -> None:
        self.records = records

    def list_ingested(self) -> Sequence[SourceRecord]:
        return self.records


class FakeFolder(MediaFolder):
    def __init__(self, files: list[str]) -> None:
        self._files = files

    def project_dirs(self) -> Sequence[MediaEntry]:
        raise AssertionError("backfill tidak membersihkan folder")

    def files(self) -> Sequence[MediaEntry]:
        return [MediaEntry(path, 0) for path in self._files]

    def remove(self, path: str) -> int:
        raise AssertionError("backfill tidak menghapus")


class FakeThumbnails(ThumbnailMaker):
    def __init__(self, failing: set[str] | None = None) -> None:
        self.failing = failing or set()
        self.calls: list[tuple[str, str, int, int]] = []

    def make(self, source: str, target: str, at_ms: int, width: int) -> None:
        self.calls.append((source, target, at_ms, width))
        if source in self.failing:
            raise ThumbnailError("gagal")


def backfill(
    records: list[SourceRecord], files: list[str], thumbnails: FakeThumbnails
) -> BackfillThumbnails:
    return BackfillThumbnails(FakeSources(records), FakeFolder(files), thumbnails)


def test_backfill_creates_only_missing_thumbnails() -> None:
    thumbnails = FakeThumbnails()
    result = backfill(
        [record("p1", "media/p1/proxy.mp4"), record("p2", "media/p2/proxy.mp4", 30_000)],
        ["media/p1/proxy.mp4", "media/p1/thumb.jpg", "media/p2/proxy.mp4"],
        thumbnails,
    )()

    assert thumbnails.calls == [("media/p2/proxy.mp4", "media/p2/thumb.jpg", 3_000, 320)]
    assert (result.created, result.failed) == (1, 0)


def test_backfill_skips_sources_not_yet_ingested() -> None:
    thumbnails = FakeThumbnails()
    result = backfill(
        [record("p1", None), record("p2", "media/p2/proxy.mp4", None)], [], thumbnails
    )()
    assert thumbnails.calls == []
    assert (result.created, result.failed) == (0, 0)


def test_backfill_continues_after_a_failure_and_counts_it() -> None:
    thumbnails = FakeThumbnails(failing={"media/p1/proxy.mp4"})
    result = backfill(
        [record("p1", "media/p1/proxy.mp4"), record("p2", "media/p2/proxy.mp4")], [], thumbnails
    )()
    assert len(thumbnails.calls) == 2
    assert (result.created, result.failed) == (1, 1)


def test_backfill_makes_one_thumbnail_per_folder() -> None:
    thumbnails = FakeThumbnails()
    backfill(
        [record("a", "media/p1/proxy.mp4"), record("b", "media/p1/proxy.mp4")], [], thumbnails
    )()
    assert len(thumbnails.calls) == 1
