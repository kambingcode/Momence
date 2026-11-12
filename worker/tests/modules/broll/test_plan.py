from typing import Any

import pytest

from clipstudio_worker.modules.broll.application import (
    BrollPlanError,
    BrollPlanRequest,
    PlanBrollJob,
    PlannedSlots,
    SlotCandidate,
    spoken_sentences,
)
from clipstudio_worker.modules.broll.application.payloads import BrollPlanToken
from clipstudio_worker.modules.clips.application import TokenUsage
from clipstudio_worker.modules.jobs.application import Job, JobFailure


def token(i: int, text: str, start: int, end: int, kind: str = "word") -> dict[str, Any]:
    return {"id": f"w{i}", "type": kind, "text": text, "startMs": start, "endMs": end}


# Klip mulai di 60 dtk video sumber; kalimat kedua mulai 64 dtk.
TOKENS = [
    token(1, "Halo", 60_000, 60_500),
    token(2, "semua.", 60_500, 61_000),
    token(3, "", 61_000, 64_000, "pause"),
    token(4, "Ini", 64_000, 64_400),
    token(5, "celengan", 64_400, 65_000),
    token(6, "eh", 65_000, 65_300, "filler"),
    token(7, "saya.", 65_300, 66_000),
]


def job(tokens: list[dict[str, Any]] = TOKENS) -> Job:
    return Job(
        id="j1",
        project_id="p1",
        type="broll-plan",
        status="running",
        progress=0,
        payload={"clipId": "c1", "title": "Rahasia nabung", "tokens": tokens},
        attempts=1,
    )


class FakePlanner:
    def __init__(self, candidates: list[SlotCandidate], error: str | None = None) -> None:
        self.candidates = candidates
        self.error = error
        self.requests: list[BrollPlanRequest] = []

    def plan(self, request: BrollPlanRequest) -> PlannedSlots:
        self.requests.append(request)
        if self.error:
            raise BrollPlanError(self.error)
        return PlannedSlots(self.candidates, TokenUsage(100, 20, 80, 0))


def test_sentences_numbered_within_clip_without_pauses() -> None:
    tokens = [BrollPlanToken.model_validate(t) for t in TOKENS]
    sentences = spoken_sentences(tokens)
    assert [(s.number, s.text) for s in sentences] == [
        (1, "Halo semua."),
        (2, "Ini celengan eh saya."),
    ]
    assert [w.text for w in sentences[1].words] == ["Ini", "celengan", "eh", "saya."]


def test_reports_rejected_candidates_and_usage() -> None:
    planner = FakePlanner(
        [
            SlotCandidate(2, "celengan", "Celengan babi", ["piggy bank", "coins"]),
            SlotCandidate(1, "Halo", "Orang melambai", ["waving"]),
        ]
    )
    progress: list[float] = []
    result = PlanBrollJob(planner)(job(), progress.append)

    [request] = planner.requests
    assert request.title == "Rahasia nabung"
    assert request.clip_start_ms == 60_000
    assert [s.number for s in request.sentences] == [1, 2]
    assert result == {
        "clipId": "c1",
        # Kalimat 1 = pembuka; "celengan" hanya 1,6 dtk sebelum klip berakhir.
        "slots": [],
        "candidateCount": 2,
        "rejected": {"in_hook": 1, "too_short": 1},
        "usage": {
            "inputTokens": 100,
            "outputTokens": 20,
            "cacheReadInputTokens": 80,
            "cacheCreationInputTokens": 0,
        },
    }
    assert progress == [5]


def test_slot_found_in_longer_clip() -> None:
    tokens = [*TOKENS, token(8, "Lalu", 66_000, 70_000), token(9, "selesai.", 70_000, 72_000)]
    planner = FakePlanner([SlotCandidate(2, "celengan", "Celengan", ["piggy bank"])])
    result = PlanBrollJob(planner)(job(tokens), lambda _: None)
    assert result["slots"] == [
        {
            "startMs": 64_400,
            "endMs": 66_400,
            "sentence": 2,
            "text": "Ini celengan eh saya.",
            "intent": "Celengan",
            "keywords": ["piggy bank"],
        }
    ]


def test_failures_become_job_failures() -> None:
    with pytest.raises(JobFailure, match="kuota habis"):
        PlanBrollJob(FakePlanner([], error="kuota habis"))(job(), lambda _: None)
    planner = FakePlanner([])
    with pytest.raises(JobFailure, match="tidak berisi ucapan"):
        PlanBrollJob(planner)(job([token(3, "", 0, 3_000, "pause")]), lambda _: None)
    assert planner.requests == []
