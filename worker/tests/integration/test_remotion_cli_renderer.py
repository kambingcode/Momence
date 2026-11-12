"""Adapter render dengan skrip palsu (Python menggantikan Node) — tanpa Remotion/Chrome."""

import sys
import textwrap
from pathlib import Path

import pytest

from clipstudio_worker.modules.render.application import RenderError, RenderRequest
from clipstudio_worker.modules.render.infrastructure.remotion_cli_renderer import (
    RENDER_SCRIPT,
    RemotionCliRenderer,
    parse_progress,
)

FAKE_SCRIPT = """
import json, sys
request = json.load(sys.stdin)
print("Downloading from: https://contoh/chrome.zip")  # log non-JSON diabaikan
print(json.dumps({"stage": "bundle", "progress": 1}))
sys.stderr.write("peringatan panjang\\n" * 20000)  # stderr besar tidak boleh membuat macet
print(json.dumps({"stage": "render", "progress": 0.5}), flush=True)
if request["props"].get("gagal"):
    sys.stderr.write("Error: komposisi tidak ditemukan\\n")
    sys.exit(1)
with open(request["outputPath"], "wb") as f:
    f.write(b"mp4" * 100)
print(json.dumps({"stage": "render", "progress": 1}))
"""


def ignore(stage: str, fraction: float) -> None:
    pass


@pytest.fixture
def renderer(tmp_path: Path) -> RemotionCliRenderer:
    web = tmp_path / "web"
    (web / RENDER_SCRIPT).parent.mkdir(parents=True)
    (web / RENDER_SCRIPT).write_text(textwrap.dedent(FAKE_SCRIPT))
    data = tmp_path / "data"
    (data / "media" / "p1").mkdir(parents=True)
    (data / "media" / "p1" / "source.mp4").write_bytes(b"video")
    return RemotionCliRenderer(data, web, node=sys.executable)


def test_parse_progress_ignores_non_progress_lines() -> None:
    assert parse_progress('{"stage": "render", "progress": 0.25}\n') == ("render", 0.25)
    assert parse_progress("Downloading from: x") is None
    assert parse_progress('{"stage": "render"}') is None
    assert parse_progress("[1, 2]") is None


def test_renders_to_final_file_atomically_and_reports_progress(
    renderer: RemotionCliRenderer, tmp_path: Path
) -> None:
    events: list[tuple[str, float]] = []
    size = renderer.render(
        RenderRequest("media/p1/source.mp4", "media/p1/renders/j1.mp4", {}),
        lambda stage, fraction: events.append((stage, fraction)),
    )
    renders = tmp_path / "data" / "media" / "p1" / "renders"
    assert size == 300
    assert [p.name for p in renders.iterdir()] == ["j1.mp4"]  # tanpa sisa .part
    assert events == [("bundle", 1.0), ("render", 0.5), ("render", 1.0)]


def test_failure_reports_stderr_tail_and_leaves_no_file(
    renderer: RemotionCliRenderer, tmp_path: Path
) -> None:
    with pytest.raises(RenderError, match="komposisi tidak ditemukan"):
        renderer.render(
            RenderRequest("media/p1/source.mp4", "media/p1/renders/j2.mp4", {"gagal": True}),
            ignore,
        )
    assert list((tmp_path / "data" / "media" / "p1" / "renders").iterdir()) == []


def test_missing_source_and_missing_node_are_clear_errors(
    renderer: RemotionCliRenderer, tmp_path: Path
) -> None:
    with pytest.raises(RenderError, match="Video sumber tidak ditemukan"):
        renderer.render(RenderRequest("media/p1/hilang.mp4", "media/p1/renders/j3.mp4", {}), ignore)
    no_node = RemotionCliRenderer(tmp_path / "data", tmp_path / "web", node="node-tidak-ada")
    with pytest.raises(RenderError, match=r"Node\.js"):
        no_node.render(RenderRequest("media/p1/source.mp4", "media/p1/renders/j4.mp4", {}), ignore)


def test_output_outside_data_dir_is_rejected(renderer: RemotionCliRenderer) -> None:
    with pytest.raises(ValueError):
        renderer.render(RenderRequest("media/p1/source.mp4", "../luar.mp4", {}), ignore)
