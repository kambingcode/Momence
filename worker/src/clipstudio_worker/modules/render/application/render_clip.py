import posixpath
from collections.abc import Mapping
from typing import Any

from clipstudio_worker.modules.jobs.application import Job, JobFailure, ReportProgress
from clipstudio_worker.modules.render.application.payloads import RenderPayload
from clipstudio_worker.modules.render.application.ports import (
    ClipRenderer,
    RenderError,
    RenderFiles,
    RenderHistory,
    RenderRequest,
)
from clipstudio_worker.modules.render.domain.outputs import superseded_outputs
from clipstudio_worker.modules.render.domain.progress import job_progress


def render_output_path(source_path: str, job_id: str) -> str:
    """MP4 hasil di folder media proyek: `media/<proyek>/renders/<jobId>.mp4`."""
    return posixpath.join(posixpath.dirname(source_path), "renders", f"{job_id}.mp4")


class RenderClipJob:
    """Render klip ke MP4 dari props yang disiapkan web. Idempoten: dijalankan ulang menimpa
    file milik job yang sama. Setelah berhasil, MP4 lama yang sudah tidak dibutuhkan dihapus
    (`superseded_outputs`); unduhan job lama itu lalu membalas 404."""

    def __init__(self, renderer: ClipRenderer, history: RenderHistory, files: RenderFiles) -> None:
        self._renderer = renderer
        self._history = history
        self._files = files

    def __call__(self, job: Job, report_progress: ReportProgress) -> Mapping[str, Any]:
        payload = RenderPayload.model_validate(job.payload)
        output_path = render_output_path(payload.source_path, job.id)

        def on_progress(stage: str, fraction: float) -> None:
            progress = job_progress(stage, fraction)
            if progress is not None:
                report_progress(progress)

        try:
            size = self._renderer.render(
                RenderRequest(payload.source_path, output_path, payload.props), on_progress
            )
        except RenderError as exc:
            raise JobFailure(str(exc)) from exc
        if job.project_id is not None:
            self._remove_superseded(job.project_id, payload.clip_id, output_path)
        # Bentuk = renderResultSchema di web.
        return {"clipId": payload.clip_id, "outputPath": output_path, "sizeBytes": size}

    def _remove_superseded(self, project_id: str, clip_id: str, keep_path: str) -> None:
        stale = superseded_outputs(
            self._history.finished_renders(project_id),
            clip_id=clip_id,
            keep_path=keep_path,
            existing_clip_ids=self._history.clip_ids(project_id),
        )
        for path in stale:
            self._files.remove(path)
