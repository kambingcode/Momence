from collections.abc import Collection, Mapping, Sequence
from typing import Any

import pytest

from clipstudio_worker.modules.jobs.application import Job, JobFailure
from clipstudio_worker.modules.render.application import (
    FinishedRender,
    RenderClipJob,
    RenderError,
    RenderRequest,
    StageProgress,
    render_output_path,
)
from clipstudio_worker.modules.render.domain.outputs import (
    is_render_output,
    superseded_outputs,
)
from clipstudio_worker.modules.render.domain.progress import job_progress

PROPS: Mapping[str, Any] = {"plan": {"fps": 30, "durationInFrames": 90, "sequences": []}}


def job(payload: object) -> Job:
    return Job(
        id="j9",
        project_id="p1",
        type="render",
        status="running",
        progress=0,
        payload=payload,
        attempts=1,
    )


class FakeRenderer:
    def __init__(self, events: list[tuple[str, float]], error: str | None = None) -> None:
        self.events = events
        self.error = error
        self.requests: list[RenderRequest] = []

    def render(self, request: RenderRequest, on_progress: StageProgress) -> int:
        self.requests.append(request)
        for stage, fraction in self.events:
            on_progress(stage, fraction)
        if self.error:
            raise RenderError(self.error)
        return 1234


class FakeHistory:
    def __init__(
        self, renders: Sequence[FinishedRender] = (), clip_ids: Collection[str] = ("c1",)
    ) -> None:
        self.renders = renders
        self.ids = clip_ids
        self.asked: list[str] = []

    def finished_renders(self, project_id: str) -> Sequence[FinishedRender]:
        self.asked.append(project_id)
        return self.renders

    def clip_ids(self, project_id: str) -> Collection[str]:
        return self.ids


class FakeFiles:
    def __init__(self) -> None:
        self.removed: list[str] = []

    def remove(self, path: str) -> None:
        self.removed.append(path)


def render_job(
    renderer: FakeRenderer, history: FakeHistory | None = None, files: FakeFiles | None = None
) -> RenderClipJob:
    return RenderClipJob(renderer, history or FakeHistory(), files or FakeFiles())


def test_job_progress_maps_stages_in_order() -> None:
    assert job_progress("browser", 0.5) == 5
    assert job_progress("bundle", 1) == 20
    assert job_progress("render", 0) == 20
    assert job_progress("render", 0.5) == 60
    assert job_progress("render", 1.7) == 100  # dijepit
    assert job_progress("lainnya", 0.5) is None


def test_output_goes_to_project_renders_folder() -> None:
    assert render_output_path("media/p1/source.mov", "j9") == "media/p1/renders/j9.mp4"


def test_render_job_passes_props_reports_progress_and_returns_result() -> None:
    renderer = FakeRenderer([("bundle", 1.0), ("tidak-dikenal", 0.3), ("render", 0.5)])
    progress: list[float] = []

    result = render_job(renderer)(
        job({"clipId": "c1", "sourcePath": "media/p1/source.mp4", "props": PROPS}),
        progress.append,
    )

    assert renderer.requests == [
        RenderRequest("media/p1/source.mp4", "media/p1/renders/j9.mp4", PROPS)
    ]
    assert progress == [20, 60]
    assert result == {"clipId": "c1", "outputPath": "media/p1/renders/j9.mp4", "sizeBytes": 1234}


def test_renderer_error_becomes_user_facing_job_failure() -> None:
    renderer = FakeRenderer([], error="Render gagal: font tidak termuat")
    with pytest.raises(JobFailure, match="font tidak termuat"):
        render_job(renderer)(
            job({"clipId": "c1", "sourcePath": "media/p1/source.mp4", "props": PROPS}),
            lambda _: None,
        )


def test_superseded_outputs_keeps_latest_per_existing_clip() -> None:
    renders = [
        FinishedRender("j1", "c1", "media/p1/renders/j1.mp4"),  # klip sama, lebih lama
        FinishedRender("j2", "c2", "media/p1/renders/j2.mp4"),  # klip lain yang masih ada
        FinishedRender("j3", "gone", "media/p1/renders/j3.mp4"),  # klip dibuang discover ulang
        FinishedRender("j4", "c1", "media/p1/renders/j9.mp4"),  # file yang baru saja ditulis
        FinishedRender("j5", "c1", "media/p1/source.mp4"),  # bukan file render → dibiarkan
    ]
    assert superseded_outputs(
        renders,
        clip_id="c1",
        keep_path="media/p1/renders/j9.mp4",
        existing_clip_ids={"c1", "c2"},
    ) == ["media/p1/renders/j1.mp4", "media/p1/renders/j3.mp4"]


def test_is_render_output_only_accepts_render_folder_mp4() -> None:
    assert is_render_output("media/p1/renders/j1.mp4")
    for path in (
        "media/p1/source.mp4",
        "media/p1/renders/j1.mov",
        "media/../renders/j1.mp4",
        "/media/p1/renders/j1.mp4",
        "media/p1/renders/sub/j1.mp4",
        "media//renders/j1.mp4",
    ):
        assert not is_render_output(path), path


def test_successful_render_removes_superseded_outputs() -> None:
    history = FakeHistory(
        [
            FinishedRender("j1", "c1", "media/p1/renders/j1.mp4"),
            FinishedRender("j2", "c2", "media/p1/renders/j2.mp4"),
        ],
        clip_ids={"c1", "c2"},
    )
    files = FakeFiles()
    render_job(FakeRenderer([]), history, files)(
        job({"clipId": "c1", "sourcePath": "media/p1/source.mp4", "props": PROPS}),
        lambda _: None,
    )
    assert history.asked == ["p1"]
    assert files.removed == ["media/p1/renders/j1.mp4"]


def test_failed_render_keeps_previous_outputs() -> None:
    history = FakeHistory([FinishedRender("j1", "c1", "media/p1/renders/j1.mp4")])
    files = FakeFiles()
    with pytest.raises(JobFailure):
        render_job(FakeRenderer([], error="gagal"), history, files)(
            job({"clipId": "c1", "sourcePath": "media/p1/source.mp4", "props": PROPS}),
            lambda _: None,
        )
    assert files.removed == []
