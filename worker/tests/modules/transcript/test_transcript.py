import pytest

from clipstudio_worker.modules.transcript.domain.transcript import (
    RecognizedWord,
    Token,
    build_word_tokens,
    choose_language,
    disfluency_prompt,
    drop_compressed_repeats,
)


@pytest.mark.parametrize(
    ("probabilities", "expected"),
    [
        ({"id": 0.6, "en": 0.3}, "id"),
        ({"en": 0.8, "id": 0.1}, "en"),
        # Melayu dihitung sebagai Indonesia: 0.3 + 0.35 > 0.4.
        ({"ms": 0.35, "en": 0.4, "id": 0.3}, "id"),
        # Bahasa lain diabaikan; pilih yang terbesar di antara id/en.
        ({"ja": 0.9, "en": 0.06, "id": 0.04}, "en"),
        ({}, "id"),
        ({"id": 0.5, "en": 0.5}, "id"),
    ],
)
def test_choose_language(probabilities: dict[str, float], expected: str) -> None:
    assert choose_language(probabilities) == expected


def test_disfluency_prompt_contains_fillers_of_that_language() -> None:
    assert "anu" in disfluency_prompt("id")
    assert "um" in disfluency_prompt("en")


def test_build_word_tokens_strips_text_and_assigns_sequential_ids() -> None:
    tokens = build_word_tokens(
        [
            RecognizedWord(" Halo,", 0.0, 0.42, 0.98765),
            RecognizedWord(" ", 0.42, 0.5, 0.1),
            RecognizedWord(" semua.", 0.5, 1.0, None),
        ],
        duration_ms=5000,
    )
    assert tokens == [
        Token(id="w1", type="word", text="Halo,", start_ms=0, end_ms=420, confidence=0.988),
        Token(id="w2", type="word", text="semua.", start_ms=500, end_ms=1000, confidence=None),
    ]


def test_build_word_tokens_removes_overlap_and_inverted_times() -> None:
    tokens = build_word_tokens(
        [
            RecognizedWord("a", 1.0, 1.5),
            RecognizedWord("b", 1.4, 1.3),  # mulai sebelum kata sebelumnya selesai & terbalik
            RecognizedWord("c", 1.6, 1.8),
        ],
        duration_ms=None,
    )
    assert [(t.start_ms, t.end_ms) for t in tokens] == [(1000, 1500), (1500, 1500), (1600, 1800)]


def test_build_word_tokens_clamps_to_audio_duration() -> None:
    tokens = build_word_tokens(
        [RecognizedWord("awal", -0.2, 0.3), RecognizedWord("akhir", 9.9, 10.4)],
        duration_ms=10_000,
    )
    assert [(t.start_ms, t.end_ms) for t in tokens] == [(0, 300), (9900, 10_000)]


def test_build_word_tokens_joins_reduplication_split_by_whisper() -> None:
    tokens = build_word_tokens(
        [
            RecognizedWord(" kehidupan", 29.5, 29.9, 0.9),
            RecognizedWord(" sehari", 30.0, 30.24, 0.95),
            RecognizedWord(" -hari", 30.24, 30.6, 0.7),
            RecognizedWord(" penonton.", 30.7, 31.2, 0.9),
        ],
        duration_ms=None,
    )
    assert [(t.id, t.text, t.start_ms, t.end_ms, t.confidence) for t in tokens] == [
        ("w1", "kehidupan", 29_500, 29_900, 0.9),
        ("w2", "sehari-hari", 30_000, 30_600, 0.7),
        ("w3", "penonton.", 30_700, 31_200, 0.9),
    ]


@pytest.mark.parametrize(
    "words",
    [
        # Ada jeda nyata sebelum tanda hubung.
        [RecognizedWord("satu", 0, 0.5), RecognizedWord("-dua", 0.8, 1.0)],
        # Kata sebelumnya mengakhiri kalimat/klausa.
        [RecognizedWord("selesai.", 0, 0.5), RecognizedWord("-lanjut", 0.5, 1.0)],
        # Tanda hubung tunggal bukan potongan kata.
        [RecognizedWord("satu", 0, 0.5), RecognizedWord("-", 0.5, 0.6)],
    ],
)
def test_build_word_tokens_keeps_separate_dash_tokens(words: list[RecognizedWord]) -> None:
    assert len(build_word_tokens(words, None)) == 2


def test_build_word_tokens_is_deterministic() -> None:
    words = [RecognizedWord("satu", 0, 0.5), RecognizedWord("dua", 0.6, 1.0)]
    assert build_word_tokens(words, 2000) == build_word_tokens(words, 2000)


SENTENCE = [
    RecognizedWord("Terima", 30.0, 30.3),
    RecognizedWord("kasih", 30.3, 30.7),
    RecognizedWord("sudah", 30.7, 31.1),
    RecognizedWord("menonton.", 31.1, 31.7),
]


def test_drop_compressed_repeats_removes_squeezed_copy_of_previous_sentence() -> None:
    # Pola nyata dari mlx-whisper: kalimat diulang di ujung klip dengan durasi ±0.
    copy = [
        RecognizedWord("Terima", 33.056, 33.076),
        RecognizedWord("kasih", 33.076, 33.076),
        RecognizedWord("sudah", 33.076, 33.076),
        RecognizedWord("menonton.", 33.076, 33.125),
    ]
    assert drop_compressed_repeats([*SENTENCE, *copy]) == SENTENCE


def test_drop_compressed_repeats_keeps_real_repetition() -> None:
    # Pembicara sungguh mengulang kalimat dengan tempo normal.
    again = [RecognizedWord(w.text, w.start + 2.0, w.end + 2.0) for w in SENTENCE]
    assert drop_compressed_repeats([*SENTENCE, *again]) == [*SENTENCE, *again]
    # "ya ya ya" dan pengulangan < 3 kata tidak disentuh.
    ya = [RecognizedWord("ya", 0, 0.01), RecognizedWord("ya", 0.01, 0.02)]
    assert drop_compressed_repeats(ya) == ya


def test_drop_compressed_repeats_ignores_case_and_punctuation() -> None:
    copy = [
        RecognizedWord("terima", 31.8, 31.8),
        RecognizedWord("Kasih,", 31.8, 31.8),
        RecognizedWord("sudah", 31.8, 31.8),
        RecognizedWord("menonton", 31.8, 31.85),
    ]
    assert drop_compressed_repeats([*SENTENCE, *copy]) == SENTENCE
