import os
from pathlib import Path

from sqlalchemy import Engine, text

from clipstudio_worker.modules.projects.infrastructure.local_media_folder import LocalMediaFolder
from clipstudio_worker.modules.projects.infrastructure.sqlalchemy_project_index import (
    SqlAlchemyProjectIndex,
)


def test_project_index_reads_project_ids(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO projects (id, name) VALUES ('p1', 'a'), ('p2', 'b')"))
    assert SqlAlchemyProjectIndex(engine).project_ids() == {"p1", "p2"}


def test_media_folder_lists_and_removes_inside_media_only(tmp_path: Path) -> None:
    folder = LocalMediaFolder(tmp_path)
    assert folder.project_dirs() == [] and folder.files() == []

    orphan = tmp_path / "media" / "yatim" / "renders"
    orphan.mkdir(parents=True)
    (orphan / "a.mp4").write_bytes(b"x" * 10)
    (tmp_path / "media" / "yatim" / "source.mp4").write_bytes(b"x" * 5)
    part = tmp_path / "media" / "p1" / ".proxy.mp4.1.part"
    part.parent.mkdir(parents=True)
    part.write_bytes(b"x" * 3)
    os.utime(part, (1_000, 1_000))
    (tmp_path / "clipstudio.db").write_bytes(b"db")

    assert {d.path for d in folder.project_dirs()} == {"media/yatim", "media/p1"}
    files = {f.path: f.modified_ms for f in folder.files()}
    assert set(files) == {
        "media/yatim/renders/a.mp4",
        "media/yatim/source.mp4",
        "media/p1/.proxy.mp4.1.part",
    }
    assert files["media/p1/.proxy.mp4.1.part"] == 1_000_000

    assert folder.remove("media/yatim") == 15
    assert folder.remove("media/p1/.proxy.mp4.1.part") == 3
    assert folder.remove("media/p1/.proxy.mp4.1.part") == 0  # sudah tidak ada
    # Di luar media/ atau media/ itu sendiri tidak pernah dihapus.
    assert folder.remove("clipstudio.db") == 0
    assert folder.remove("media") == 0
    assert folder.remove("../luar") == 0
    assert (tmp_path / "clipstudio.db").exists()
    assert not (tmp_path / "media" / "yatim").exists()
