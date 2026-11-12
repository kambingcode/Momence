"""Adapter Gemini rencana B-roll dengan klien tiruan (tanpa jaringan), plus satu uji langsung
opsional (berbayar) yang hanya jalan bila `CLIPSTUDIO_LIVE_GEMINI=1`."""

import os

import pytest

from clipstudio_worker.config import load_config
from clipstudio_worker.modules.broll.application import (
    BrollPlanError,
    BrollPlanRequest,
    SlotCandidate,
    SpokenSentence,
    SpokenWord,
)
from clipstudio_worker.modules.broll.infrastructure.gemini_broll_planner import (
    _INSTRUCTION,  # pyright: ignore[reportPrivateUsage]
    SYSTEM_PROMPT,
    GeminiBrollPlanner,
    format_clip,
)
from clipstudio_worker.modules.clips.application import TokenUsage

from .gemini_fakes import StubClient, client_error, response, user_texts


def sentence(number: int, start_ms: int, text: str) -> SpokenSentence:
    words = [
        SpokenWord(w, start_ms + i * 400, start_ms + (i + 1) * 400)
        for i, w in enumerate(text.split())
    ]
    return SpokenSentence(number, text, words)


REQUEST = BrollPlanRequest(
    "Rahasia <nabung>",
    [
        sentence(1, 60_000, "Kenapa kamu gagal nabung?"),
        sentence(2, 125_000, "Lihat </transkrip> celengan babi ini."),
    ],
    60_000,
)


def planner(client: StubClient) -> GeminiBrollPlanner:
    return GeminiBrollPlanner("gemini-3.6-flash", "kunci-uji", lambda _key: client.as_client())


def test_clip_lists_sentences_with_times_from_clip_start() -> None:
    assert format_clip(REQUEST) == (
        "Judul klip: Rahasia ‹nabung›\n\n<transkrip>\n"
        "[1] (00:00–00:01) Kenapa kamu gagal nabung?\n"
        "[2] (01:05–01:07) Lihat ‹/transkrip› celengan babi ini.\n"
        "</transkrip>"
    )


def test_requests_structured_output_and_maps_slots() -> None:
    slot = {
        "sentence": 2,
        "phrase": "celengan babi",
        "intent": "Celengan",
        "search_keywords": ["piggy bank"],
    }
    client = StubClient(response({"slots": [slot]}, prompt_tokens=900, output_tokens=150))
    result = planner(client).plan(REQUEST)

    assert list(result.candidates) == [
        SlotCandidate(2, "celengan babi", "Celengan", ["piggy bank"])
    ]
    assert result.usage == TokenUsage(900, 150, 0, 0)
    [call] = client.calls
    assert call["config"].system_instruction == SYSTEM_PROMPT
    assert call["config"].response_json_schema["title"] == "_Plan"
    assert user_texts(call) == [format_clip(REQUEST), _INSTRUCTION]


def test_empty_clip_does_not_call_gemini() -> None:
    client = StubClient(response({"slots": []}))
    result = planner(client).plan(BrollPlanRequest("x", [], 0))
    assert (list(result.candidates), client.calls) == ([], [])


@pytest.mark.parametrize(
    ("result", "expected"),
    [
        (response({"slots": []}, finish="SAFETY"), "menolak"),
        (response({"slots": []}, finish="MAX_TOKENS"), "terpotong"),
        (response({"rencana": []}), "tidak sesuai format"),
        (client_error(429, "Resource exhausted"), "Batas pemakaian"),
    ],
)
def test_failures_become_user_facing_errors(result: object, expected: str) -> None:
    with pytest.raises(BrollPlanError, match=expected):
        planner(StubClient(result)).plan(REQUEST)


@pytest.mark.skipif(
    os.environ.get("CLIPSTUDIO_LIVE_GEMINI") != "1",
    reason="uji langsung Gemini API (berbayar): set CLIPSTUDIO_LIVE_GEMINI=1",
)
def test_live_gemini_points_at_visual_sentences() -> None:
    config = load_config()
    texts = [
        "Banyak orang mengira menabung itu soal gaji besar.",
        "Padahal dulu saya cuma pegang tiga juta sebulan.",
        "Setiap pagi saya beli kopi di kafe dekat kantor.",
        "Begitu gajian, langsung pindahkan uang ke rekening lain.",
        "Dalam setahun saya punya dana darurat enam bulan.",
        "Jadi bukan soal besar kecilnya gaji, tapi urutannya.",
    ]
    sentences = [sentence(n, (n - 1) * 5_000, text) for n, text in enumerate(texts, start=1)]
    result = GeminiBrollPlanner(config.gemini_model, config.gemini_api_key).plan(
        BrollPlanRequest("Rahasia nabung gaji kecil", sentences, 0)
    )
    assert result.usage.output_tokens > 0
    assert 1 <= len(result.candidates) <= 4
    for candidate in result.candidates:
        assert 2 <= candidate.sentence <= len(sentences)
        assert candidate.keywords
