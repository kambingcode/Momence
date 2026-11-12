import itertools

from clipstudio_worker.modules.transcript.domain.speech import (
    TimeRange,
    align_to_speech,
    decode_ranges,
    keep_spoken,
    silent_parts,
)
from clipstudio_worker.modules.transcript.domain.transcript import RecognizedWord, Token


def test_decode_ranges_pads_merges_short_gaps_and_clamps() -> None:
    speech = [TimeRange(100, 1000), TimeRange(2500, 3000), TimeRange(9000, 9950)]
    assert decode_ranges(speech, duration_ms=10_000) == [
        # 1000+200 → 2500-200: celah 1,1 dtk ≤ 2 dtk → digabung.
        TimeRange(0, 3200),
        TimeRange(8800, 10_000),
    ]


def test_decode_ranges_keeps_long_silence_out() -> None:
    assert decode_ranges([TimeRange(0, 1000), TimeRange(30_000, 31_000)], None) == [
        TimeRange(0, 1200),
        TimeRange(29_800, 31_200),
    ]


def test_decode_ranges_sorts_input_and_handles_empty() -> None:
    assert decode_ranges([], 5000) == []
    assert decode_ranges([TimeRange(3000, 3500), TimeRange(0, 500)], None, merge_gap_ms=0) == [
        TimeRange(0, 700),
        TimeRange(2800, 3700),
    ]


def test_keep_spoken_drops_words_far_from_speech() -> None:
    speech = [TimeRange(1000, 2000), TimeRange(5000, 6000)]
    words = [
        RecognizedWord("sebelum", 0.0, 0.5),  # berakhir 500 ms sebelum ucapan > toleransi
        RecognizedWord("tepi", 0.6, 0.8),  # berakhir 200 ms sebelum ucapan → masih dalam toleransi
        RecognizedWord("di dalam", 1.2, 1.5),
        RecognizedWord("lewat", 2.25, 2.5),  # mulai 250 ms setelah ucapan → toleransi
        RecognizedWord("halusinasi", 3.0, 4.0),
        RecognizedWord("menyeberang", 4.5, 5.5),
        RecognizedWord("akhir", 7.0, 7.5),
    ]
    assert [w.text for w in keep_spoken(words, speech)] == [
        "tepi",
        "di dalam",
        "lewat",
        "menyeberang",
    ]


def test_keep_spoken_without_speech_drops_everything() -> None:
    assert keep_spoken([RecognizedWord("Thank", 0, 1), RecognizedWord("you.", 1, 2)], []) == []


def token(id_: str, start: int, end: int, text: str = "x") -> Token:
    return Token(id=id_, type="word", text=text, start_ms=start, end_ms=end)


def spans(tokens: list[Token]) -> list[tuple[int, int]]:
    return [(t.start_ms, t.end_ms) for t in tokens]


def test_align_trims_words_that_run_into_silence() -> None:
    # Whisper memanjangkan "a" sampai menutupi hening 1000–1600.
    speech = [TimeRange(0, 1000), TimeRange(1600, 2500)]
    tokens = [token("w1", 200, 1500), token("w2", 1700, 2400)]
    assert spans(align_to_speech(tokens, speech)) == [(0, 1000), (1600, 2500)]


def test_align_extends_edge_words_to_speech_edges_but_not_inner_words() -> None:
    # Whisper mengakhiri kata terlalu cepat; kata di tengah rentang tidak diubah.
    speech = [TimeRange(1000, 3000), TimeRange(4000, 5000)]
    tokens = [token("w1", 1100, 1500), token("w2", 1600, 2000), token("w3", 2100, 2700),
              token("w4", 4100, 4800)]  # fmt: skip
    assert spans(align_to_speech(tokens, speech)) == [
        (1000, 1500),
        (1600, 2000),
        (2100, 3000),
        (4000, 5000),
    ]


def test_align_keeps_misaligned_words_and_preserves_order() -> None:
    speech = [TimeRange(1000, 2000)]
    tokens = [
        token("w1", 0, 1040),  # hanya 40 ms di dalam ucapan → timestamp meleset, dibiarkan
        token("w2", 1100, 1500),
        token("w3", 2500, 2600),  # di luar ucapan → dibiarkan
    ]
    aligned = align_to_speech(tokens, speech)
    # w2 = satu-satunya kata selaras di rentang: diperpanjang ke tepi, dibatasi akhir w1.
    assert spans(aligned) == [(0, 1040), (1040, 2000), (2500, 2600)]
    assert [t.id for t in aligned] == ["w1", "w2", "w3"]


def test_align_never_creates_overlap() -> None:
    speech = [TimeRange(0, 1000), TimeRange(1200, 2000)]
    tokens = [token("w1", 900, 1150), token("w2", 1100, 1300)]
    aligned = align_to_speech(tokens, speech)
    assert all(a.end_ms <= b.start_ms for a, b in itertools.pairwise(aligned))
    assert all(t.start_ms <= t.end_ms for t in aligned)


def test_align_without_speech_returns_tokens_unchanged() -> None:
    tokens = [token("w1", 0, 100)]
    assert align_to_speech(tokens, []) == tokens


def test_silent_parts_subtracts_speech() -> None:
    speech = [TimeRange(100, 200), TimeRange(400, 500), TimeRange(900, 1200)]
    assert silent_parts(0, 1000, speech) == [
        TimeRange(0, 100),
        TimeRange(200, 400),
        TimeRange(500, 900),
    ]
    assert silent_parts(150, 450, speech) == [TimeRange(200, 400)]
    assert silent_parts(950, 1100, speech) == []
    assert silent_parts(0, 50, []) == [TimeRange(0, 50)]
