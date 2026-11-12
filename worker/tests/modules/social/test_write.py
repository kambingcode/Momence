from typing import Any

import pytest

from clipstudio_worker.modules.clips.application import TokenUsage
from clipstudio_worker.modules.jobs.application import Job, JobFailure
from clipstudio_worker.modules.social.application import (
    DraftPostCopy,
    PostCopyError,
    PostCopyRequest,
    WritePostCopyJob,
)


def job(**overrides: Any) -> Job:
    payload = {
        "clipId": "c1",
        "title": "Rahasia nabung",
        "hook": "Gaji kecil tetap bisa nabung",
        "platform": "tiktok",
        "language": None,
        "transcript": "Halo semua. Ini celengan saya.",
    }
    return Job(
        id="j1",
        project_id="p1",
        type="post-copy",
        status="running",
        progress=0,
        payload={**payload, **overrides},
        attempts=1,
    )


class FakeWriter:
    def __init__(self, draft: DraftPostCopy | None = None, error: str | None = None) -> None:
        self.draft = draft or DraftPostCopy(
            "Nabung itu soal urutan #tips",
            "Kenapa gajimu cepat habis?",
            ["#Nabung", "nabung", "#GajiKecil", "#2026"],
            TokenUsage(100, 20, 80, 0),
        )
        self.error = error
        self.requests: list[PostCopyRequest] = []

    def write(self, request: PostCopyRequest) -> DraftPostCopy:
        self.requests.append(request)
        if self.error:
            raise PostCopyError(self.error)
        return self.draft


def test_writes_cleaned_copy_and_reports_usage() -> None:
    writer = FakeWriter()
    progress: list[float] = []
    result = WritePostCopyJob(writer)(job(), progress.append)

    assert writer.requests == [
        PostCopyRequest(
            "Rahasia nabung",
            "Gaji kecil tetap bisa nabung",
            "Halo semua. Ini celengan saya.",
            "tiktok",
            None,
        )
    ]
    assert result == {
        "clipId": "c1",
        "platform": "tiktok",
        "caption": "Nabung itu soal urutan",
        "altCaption": "Kenapa gajimu cepat habis?",
        "hashtags": ["#nabung", "#gajikecil"],
        "usage": {
            "inputTokens": 100,
            "outputTokens": 20,
            "cacheReadInputTokens": 80,
            "cacheCreationInputTokens": 0,
        },
    }
    assert progress == [5]


def test_platform_and_language_reach_the_writer() -> None:
    writer = FakeWriter()
    WritePostCopyJob(writer)(job(platform="shorts", language="en"), lambda _: None)
    [request] = writer.requests
    assert (request.platform, request.language) == ("shorts", "en")


def test_writer_failure_becomes_job_failure() -> None:
    with pytest.raises(JobFailure, match="kuota habis"):
        WritePostCopyJob(FakeWriter(error="kuota habis"))(job(), lambda _: None)


def test_clip_without_speech_does_not_call_writer() -> None:
    writer = FakeWriter()
    with pytest.raises(JobFailure, match="tidak berisi ucapan"):
        WritePostCopyJob(writer)(job(transcript="   "), lambda _: None)
    assert writer.requests == []


def test_empty_caption_fails_instead_of_returning_blank_result() -> None:
    draft = DraftPostCopy("#cuma #hashtag", "", ["#a"], TokenUsage())
    with pytest.raises(JobFailure, match="tidak menghasilkan caption"):
        WritePostCopyJob(FakeWriter(draft))(job(), lambda _: None)


def test_unknown_platform_is_rejected_by_payload_validation() -> None:
    with pytest.raises(ValueError, match="platform"):
        WritePostCopyJob(FakeWriter())(job(platform="myspace"), lambda _: None)
