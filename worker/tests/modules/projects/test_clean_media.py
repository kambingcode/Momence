from collections.abc import Collection, Sequence

from clipstudio_worker.modules.projects.application import CleanMedia, MediaEntry
from clipstudio_worker.modules.projects.domain.cleanup import (
    STALE_AFTER_MS,
    is_partial_file,
    plan_cleanup,
)

NOW = 10 * STALE_AFTER_MS
OLD = NOW - STALE_AFTER_MS
FRESH = NOW - 60_000


def test_partial_file_names() -> None:
    for name in ("source.mp4.part", ".proxy.mp4.123.part", ".j1.456.part.mp4", ".face.task.part"):
        assert is_partial_file(name), name
    for name in ("source.mp4", "proxy.mp4", "audio.wav", "party.mp4", "j1.mp4"):
        assert not is_partial_file(name), name


def test_plan_removes_only_old_orphans_and_old_partials() -> None:
    dirs = [
        MediaEntry("media/p1", OLD),  # proyek ada
        MediaEntry("media/yatim", OLD),  # tanpa proyek, lama → hapus
        MediaEntry("media/unggah", FRESH),  # tanpa proyek, baru (unggahan berjalan) → biarkan
    ]
    files = [
        MediaEntry("media/p1/source.mp4", OLD),
        MediaEntry("media/p1/.proxy.mp4.9.part", OLD),  # → hapus
        MediaEntry("media/p1/renders/.j2.9.part.mp4", FRESH),  # sedang ditulis → biarkan
        MediaEntry("media/yatim/source.mp4.part", OLD),  # ikut folder yatim, tidak ganda
        MediaEntry("media/unggah/source.mp4.part", FRESH),
    ]
    plan = plan_cleanup(dirs, files, {"p1"}, NOW)
    assert plan.orphan_dirs == ["media/yatim"]
    assert plan.partial_files == ["media/p1/.proxy.mp4.9.part"]


class FakeFolder:
    def __init__(self) -> None:
        self.removed: list[str] = []

    def project_dirs(self) -> Sequence[MediaEntry]:
        return [MediaEntry("media/p1", OLD), MediaEntry("media/x", OLD)]

    def files(self) -> Sequence[MediaEntry]:
        return [MediaEntry("media/p1/.proxy.mp4.1.part", OLD)]

    def remove(self, path: str) -> int:
        self.removed.append(path)
        return 100


class FakeIndex:
    def project_ids(self) -> Collection[str]:
        return {"p1"}


def test_clean_media_removes_plan_and_sums_freed_bytes() -> None:
    folder = FakeFolder()
    result = CleanMedia(FakeIndex(), folder, now=lambda: NOW)()
    assert folder.removed == ["media/x", "media/p1/.proxy.mp4.1.part"]
    assert result.freed_bytes == 200
    assert result.orphan_dirs == ["media/x"]
