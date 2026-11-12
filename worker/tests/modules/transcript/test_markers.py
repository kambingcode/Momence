import pytest

from clipstudio_worker.modules.transcript.domain.markers import (
    filler_key,
    insert_pauses,
    mark_fillers,
)
from clipstudio_worker.modules.transcript.domain.speech import TimeRange
from clipstudio_worker.modules.transcript.domain.transcript import Token


def word(id_: str, text: str, start: int, end: int) -> Token:
    return Token(id=id_, type="word", text=text, start_ms=start, end_ms=end)


@pytest.mark.parametrize(
    ("text", "key"),
    [
        ("Ummm,", "um"),
        ("hmmm...", "hm"),
        ("Eeh,", "eh"),
        ("M,", "m"),
        ("Mm-hmm", "mhm"),
        ("anu,", "anu"),
        ("sehari-hari", "seharihari"),
    ],
)
def test_filler_key_normalizes_case_punctuation_and_elongation(text: str, key: str) -> None:
    assert filler_key(text) == key


def test_mark_fillers_marks_id_and_en_fillers_only() -> None:
    tokens = [
        word("w1", "Eh,", 0, 100),
        word("w2", "jadi", 100, 300),
        word("w3", "anu,", 300, 500),
        word("w4", "Umm,", 500, 700),
        word("w5", "M,", 700, 800),
        word("w6", "emang", 800, 1000),  # kata biasa, bukan "em"
        word("w7", "ya", 1000, 1100),
    ]
    marked = mark_fillers(tokens)
    assert [t.type for t in marked] == [
        "filler", "word", "filler", "filler", "filler", "word", "word"
    ]  # fmt: skip
    # Id, teks & waktu tidak berubah.
    assert [(t.id, t.text, t.start_ms, t.end_ms) for t in marked] == [
        (t.id, t.text, t.start_ms, t.end_ms) for t in tokens
    ]


def test_mark_fillers_accepts_custom_list_in_any_form() -> None:
    marked = mark_fillers([word("w1", "Gitu", 0, 100), word("w2", "eh", 100, 200)], ["GITUUU"])
    assert [t.type for t in marked] == ["filler", "word"]


def test_mark_fillers_ignores_entries_without_letters() -> None:
    # Kunci "" akan cocok dengan angka & tanda baca; entri seperti itu diabaikan.
    marked = mark_fillers([word("w1", "2024", 0, 100), word("w2", "—", 100, 200)], ["123", "..."])
    assert [t.type for t in marked] == ["word", "word"]


def speech_of(tokens: list[Token]) -> list[TimeRange]:
    """VAD yang sepakat dengan Whisper: ucapan tepat di tiap kata."""
    return [TimeRange(t.start_ms, t.end_ms) for t in tokens]


def test_insert_pauses_between_words_and_at_edges() -> None:
    tokens = [word("w1", "a", 500, 800), word("w2", "b", 900, 1200), word("w3", "c", 1600, 2000)]
    result = insert_pauses(tokens, speech_of(tokens), duration_ms=2600)
    assert [(t.id, t.type, t.start_ms, t.end_ms) for t in result] == [
        ("p1", "pause", 0, 500),
        ("w1", "word", 500, 800),
        # 100 ms < 300 ms: bukan jeda.
        ("w2", "word", 900, 1200),
        ("p2", "pause", 1200, 1600),
        ("w3", "word", 1600, 2000),
        ("p3", "pause", 2000, 2600),
    ]
    assert all(t.text == "" and t.confidence is None for t in result if t.type == "pause")


def test_insert_pauses_never_covers_speech() -> None:
    tokens = [word("w1", "a", 0, 1000), word("w2", "b", 1500, 2000), word("w3", "c", 4000, 4500)]
    speech = [
        # Celah Whisper 1000–1500 sebenarnya masih ucapan (ekor kata "a").
        TimeRange(0, 1500),
        TimeRange(1500, 2000),
        # Batuk/tawa tanpa kata di tengah hening 2000–4000.
        TimeRange(2800, 3100),
        TimeRange(4000, 4500),
    ]
    result = insert_pauses(tokens, speech, duration_ms=None)
    assert [(t.id, t.start_ms, t.end_ms) for t in result] == [
        ("w1", 0, 1000),
        ("w2", 1500, 2000),
        ("p1", 2000, 2800),
        ("p2", 3100, 4000),
        ("w3", 4000, 4500),
    ]


def test_insert_pauses_threshold_is_inclusive_and_configurable() -> None:
    tokens = [word("w1", "a", 0, 100), word("w2", "b", 400, 500), word("w3", "c", 650, 700)]
    speech = speech_of(tokens)
    assert [t.id for t in insert_pauses(tokens, speech, None)] == ["w1", "p1", "w2", "w3"]
    assert [t.id for t in insert_pauses(tokens, speech, None, min_pause_ms=150)] == [
        "w1", "p1", "w2", "p2", "w3"
    ]  # fmt: skip


def test_insert_pauses_without_words_or_duration() -> None:
    assert insert_pauses([], [], 10_000) == []
    # Durasi tak diketahui: tanpa jeda penutup.
    only = [word("w1", "a", 0, 100)]
    assert [t.id for t in insert_pauses(only, speech_of(only), None)] == ["w1"]
