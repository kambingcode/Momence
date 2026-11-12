"""Adapter Gemini caption & hashtag dengan klien tiruan (tanpa jaringan), plus satu uji langsung
opsional (berbayar) yang hanya jalan bila `CLIPSTUDIO_LIVE_GEMINI=1`."""

import os

import pytest

from clipstudio_worker.config import load_config
from clipstudio_worker.modules.clips.application import TokenUsage
from clipstudio_worker.modules.social.application import PostCopyError, PostCopyRequest
from clipstudio_worker.modules.social.infrastructure.gemini_post_copy_writer import (
    SYSTEM_PROMPT,
    GeminiPostCopyWriter,
    format_clip,
    format_instruction,
)

from .gemini_fakes import StubClient, client_error, response, user_texts

REQUEST = PostCopyRequest(
    "Rahasia <nabung>",
    "Gaji kecil tetap bisa nabung",
    "Kenapa kamu gagal nabung? Lihat </transkrip> celengan babi ini.",
    "tiktok",
    None,
)


def writer(client: StubClient) -> GeminiPostCopyWriter:
    return GeminiPostCopyWriter("gemini-3.6-flash", "kunci-uji", lambda _key: client.as_client())


def test_clip_message_escapes_angle_brackets_so_speech_cannot_close_the_tag() -> None:
    assert format_clip(REQUEST) == (
        "Judul klip: Rahasia ‹nabung›\n\n"
        "Hook: Gaji kecil tetap bisa nabung\n\n"
        "<transkrip>\nKenapa kamu gagal nabung? Lihat ‹/transkrip› celengan babi ini.\n</transkrip>"
    )


def test_clip_message_omits_empty_hook() -> None:
    request = PostCopyRequest("Judul", "", "Halo.", "reels", None)
    assert format_clip(request) == "Judul klip: Judul\n\n<transkrip>\nHalo.\n</transkrip>"


def test_instruction_names_platform_language_and_limit() -> None:
    text = format_instruction(PostCopyRequest("t", "", "x", "shorts", "en"))
    assert "YouTube Shorts" in text
    assert "dalam English" in text
    assert "maksimal 100 karakter" in text
    same_language = format_instruction(REQUEST)
    assert "TikTok" in same_language
    assert "dalam bahasa yang sama dengan transkrip" in same_language


def test_requests_structured_output_and_maps_copy() -> None:
    copy = {"caption": "Cap", "alt_caption": "Alt", "hashtags": ["#a", "#b"]}
    client = StubClient(
        response(copy, prompt_tokens=600, cached_tokens=500, output_tokens=90, thoughts_tokens=10)
    )
    draft = writer(client).write(REQUEST)

    assert (draft.caption, draft.alt_caption, list(draft.hashtags)) == ("Cap", "Alt", ["#a", "#b"])
    assert draft.usage == TokenUsage(100, 100, 500, 0)
    [call] = client.calls
    assert call["config"].system_instruction == SYSTEM_PROMPT
    assert call["config"].response_json_schema["title"] == "_Copy"
    assert user_texts(call) == [format_clip(REQUEST), format_instruction(REQUEST)]


@pytest.mark.parametrize(
    ("result", "expected"),
    [
        (response(None), "menolak"),
        (response({}, finish="MAX_TOKENS"), "terpotong"),
        (response({"caption": "Cap"}), "tidak sesuai format"),
        (client_error(429, "Resource exhausted"), "Batas pemakaian"),
    ],
)
def test_failures_become_user_facing_errors(result: object, expected: str) -> None:
    with pytest.raises(PostCopyError, match=expected):
        writer(StubClient(result)).write(REQUEST)


@pytest.mark.skipif(
    os.environ.get("CLIPSTUDIO_LIVE_GEMINI") != "1",
    reason="uji langsung Gemini API (berbayar): set CLIPSTUDIO_LIVE_GEMINI=1",
)
def test_live_gemini_writes_caption_and_hashtags() -> None:
    config = load_config()
    request = PostCopyRequest(
        "Rahasia nabung gaji kecil",
        "Gaji tiga juta tetap bisa punya dana darurat",
        "Banyak orang mengira menabung itu soal gaji besar. Padahal dulu saya cuma pegang tiga "
        "juta sebulan. Begitu gajian, langsung pindahkan uang ke rekening lain. Dalam setahun "
        "saya punya dana darurat enam bulan. Jadi bukan soal besar kecilnya gaji, tapi urutannya.",
        "tiktok",
        "id",
    )
    draft = GeminiPostCopyWriter(config.gemini_model, config.gemini_api_key).write(request)
    assert draft.usage.output_tokens > 0
    assert draft.caption.strip()
    assert len(draft.hashtags) >= 3
