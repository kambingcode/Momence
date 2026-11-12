from clipstudio_worker.modules.clips.application import (
    ClipCandidate,
    DiscoveredClip,
    Sentence,
    Subscore,
    SubscoreName,
)
from clipstudio_worker.modules.clips.domain.clip import (
    MAX_KEYWORDS,
    keyword_key,
    overlap_ratio,
    remove_duplicates,
    resolve_candidate,
)

# Kalimat 10 dtk: [1] 0–10 s, [2] 10–20 s, …, [12] 110–120 s.
WINDOW = [
    Sentence(n, f"kalimat {n}.", (n - 1) * 10_000, n * 10_000, f"w{n}a", f"w{n}z")
    for n in range(1, 13)
]


def scores(*values: int) -> dict[SubscoreName, Subscore]:
    names: tuple[SubscoreName, ...] = ("hook", "flow", "value", "trend")
    return {name: Subscore(v, f" komentar {name} ") for name, v in zip(names, values, strict=True)}


def candidate(start: int, end: int, title: str = " Judul ", *values: int) -> ClipCandidate:
    return ClipCandidate(start, end, title, " hook ", scores(*(values or (5, 5, 5, 5))))


def clip(start_ms: int, end_ms: int, total: int = 20) -> DiscoveredClip:
    return DiscoveredClip("t", "h", start_ms, end_ms, "a", "b", scores(total - 15, 5, 5, 5))


def test_maps_sentence_numbers_to_times_and_token_ids() -> None:
    resolved = resolve_candidate(candidate(2, 4, " Judul ", 7, 12, -1, 5), WINDOW)
    assert resolved == DiscoveredClip(
        title="Judul",
        hook="hook",
        start_ms=10_000,
        end_ms=40_000,
        start_token_id="w2a",
        end_token_id="w4z",
        subscores={
            "hook": Subscore(7, "komentar hook"),
            # Dijepit ke 0–10.
            "flow": Subscore(10, "komentar flow"),
            "value": Subscore(0, "komentar value"),
            "trend": Subscore(5, "komentar trend"),
        },
    )


def test_too_long_clip_is_rejected_not_trimmed() -> None:
    # Memangkas bisa membuang punchline yang dinilai Gemini; judul & skor jadi tidak sesuai.
    assert resolve_candidate(candidate(1, 12), WINDOW) == "too_long"
    assert resolve_candidate(candidate(2, 11), WINDOW) == "too_long"


def test_boundaries_at_exact_limits_are_accepted() -> None:
    shortest = resolve_candidate(candidate(1, 2), WINDOW)
    assert isinstance(shortest, DiscoveredClip)
    assert shortest.duration_ms == 20_000
    longest = resolve_candidate(candidate(3, 11), WINDOW)
    assert isinstance(longest, DiscoveredClip)
    assert longest.duration_ms == 90_000


def test_rejects_invalid_candidates() -> None:
    assert resolve_candidate(candidate(1, 1), WINDOW) == "too_short"
    assert resolve_candidate(candidate(0, 3), WINDOW) == "unknown_sentence"
    assert resolve_candidate(candidate(11, 13), WINDOW) == "unknown_sentence"
    assert resolve_candidate(candidate(5, 3), WINDOW) == "reversed"
    assert resolve_candidate(candidate(1, 3, "  "), WINDOW) == "empty_title"


def test_overlap_ratio_is_relative_to_shorter_clip() -> None:
    assert overlap_ratio(clip(0, 60_000), clip(50_000, 70_000)) == 0.5
    assert overlap_ratio(clip(0, 30_000), clip(30_000, 60_000)) == 0.0
    assert overlap_ratio(clip(0, 60_000), clip(10_000, 20_000)) == 1.0


def test_remove_duplicates_keeps_best_of_overlapping_and_sorts_chronologically() -> None:
    weak = clip(0, 40_000, total=18)
    strong = clip(10_000, 50_000, total=30)
    neighbour = clip(45_000, 80_000, total=10)  # tumpang-tindih 5 dtk dengan `strong`: dibiarkan
    later = clip(200_000, 230_000, total=12)
    assert remove_duplicates([later, weak, neighbour, strong]) == [strong, neighbour, later]


def test_remove_duplicates_tie_prefers_earlier_clip() -> None:
    first = clip(0, 30_000)
    second = clip(5_000, 35_000)
    assert remove_duplicates([second, first]) == [first]


def test_keyword_key_matches_web_word_key() -> None:
    assert keyword_key("“Nabung,”") == "nabung"
    assert keyword_key("di-ulang") == "di-ulang"
    assert keyword_key("...") == ""


def test_keywords_keep_only_single_words_spoken_in_the_clip() -> None:
    window = [
        Sentence(1, "Dana darurat itu penting.", 0, 10_000, "w1", "w4"),
        Sentence(2, "Nabung dulu, baru belanja!", 10_000, 20_000, "w5", "w9"),
        Sentence(3, "Investasi belakangan.", 20_000, 30_000, "w10", "w11"),
    ]
    proposed = ClipCandidate(
        1,
        2,
        "Judul",
        "hook",
        scores(5, 5, 5, 5),
        # Ganda (beda huruf/tanda baca), frasa, kata di luar klip, kosong → dibuang.
        ["Nabung", "nabung,", "dana darurat", "Investasi", "", "BELANJA!", "penting"],
    )
    resolved = resolve_candidate(proposed, window)
    assert isinstance(resolved, DiscoveredClip)
    assert resolved.keywords == ("nabung", "belanja", "penting")


def test_keywords_are_capped() -> None:
    words = [f"kata{i}" for i in range(MAX_KEYWORDS + 3)]
    window = [Sentence(1, " ".join(words), 0, 20_000, "w1", "w9")]
    resolved = resolve_candidate(ClipCandidate(1, 1, "J", "h", scores(5, 5, 5, 5), words), window)
    assert isinstance(resolved, DiscoveredClip)
    assert resolved.keywords == tuple(words[:MAX_KEYWORDS])
