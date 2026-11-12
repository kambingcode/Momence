import itertools

from clipstudio_worker.modules.clips.application import Sentence
from clipstudio_worker.modules.clips.domain.windows import split_windows

MINUTE = 60_000


def sentences(total_ms: int, every_ms: int = 10_000) -> list[Sentence]:
    """Kalimat 10 dtk berturut-turut tanpa celah."""
    return [
        Sentence(n + 1, f"kalimat {n + 1}.", start, start + every_ms, f"w{n}a", f"w{n}b")
        for n, start in enumerate(range(0, total_ms, every_ms))
    ]


def span(window: list[Sentence]) -> tuple[int, int]:
    return window[0].start_ms, window[-1].end_ms


def test_short_transcript_is_one_window() -> None:
    all_sentences = sentences(12 * MINUTE)
    assert split_windows(all_sentences) == [all_sentences]


def test_long_transcript_uses_ten_minute_windows_with_clip_length_overlap() -> None:
    windows = split_windows(sentences(22 * MINUTE))
    assert [span(w) for w in windows] == [
        (0, 10 * MINUTE),
        # Mulai 90 dtk sebelum akhir jendela sebelumnya; sisa 22:00 − 18:30 = 3,5 menit
        # (< setengah jendela) digabung ke jendela ini.
        (8 * MINUTE + 30_000, 22 * MINUTE),
    ]
    windows = split_windows(sentences(30 * MINUTE))
    assert [span(w) for w in windows] == [
        (0, 10 * MINUTE),
        (8 * MINUTE + 30_000, 18 * MINUTE + 30_000),
        (17 * MINUTE, 30 * MINUTE),
    ]


def test_every_sentence_is_covered_and_windows_stay_bounded() -> None:
    all_sentences = sentences(95 * MINUTE, every_ms=7_000)
    windows = split_windows(all_sentences)
    covered = {s.number for w in windows for s in w}
    assert covered == {s.number for s in all_sentences}
    for window in windows:
        start, end = span(window)
        assert end - start <= 15 * MINUTE
    for previous, current in itertools.pairwise(windows):
        # Tumpang-tindih tidak melebihi 90 dtk + satu kalimat, dan selalu maju.
        assert current[0].number > previous[0].number
        assert previous[-1].end_ms - current[0].start_ms <= 90_000 + 7_000


def test_sentence_longer_than_window_still_progresses() -> None:
    long = [
        Sentence(1, "a.", 0, 11 * MINUTE, "w1", "w1"),
        Sentence(2, "b.", 11 * MINUTE, 22 * MINUTE, "w2", "w2"),
        Sentence(3, "c.", 22 * MINUTE, 33 * MINUTE, "w3", "w3"),
    ]
    assert [[s.number for s in w] for w in split_windows(long)] == [[1], [2], [3]]


def test_no_sentences_no_windows() -> None:
    assert split_windows([]) == []
