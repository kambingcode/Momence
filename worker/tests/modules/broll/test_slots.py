from clipstudio_worker.modules.broll.domain.slots import (
    MAX_SLOT_MS,
    MIN_SLOT_MS,
    BrollSlot,
    SlotCandidate,
    SpokenSentence,
    SpokenWord,
    anchor_words,
    clean_keywords,
    resolve_slot,
    select_slots,
)


def sentence(number: int, start_ms: int, text: str, word_ms: int = 400) -> SpokenSentence:
    words = [
        SpokenWord(w, start_ms + i * word_ms, start_ms + (i + 1) * word_ms)
        for i, w in enumerate(text.split())
    ]
    return SpokenSentence(number, text, words)


# Klip 0–30 dtk: kalimat 1 di 0 dtk (hook), kalimat 2 di 5 dtk, 3 di 12 dtk, 4 di 20 dtk.
SENTENCES = [
    sentence(1, 0, "Kenapa kamu selalu gagal nabung?"),
    sentence(2, 5_000, "Coba lihat celengan babi di meja kamu."),
    sentence(3, 12_000, "Uangnya habis buat kopi setiap pagi."),
    sentence(4, 20_000, "Mulai sekarang catat semua pengeluaran harian."),
    sentence(5, 28_000, "Oke?"),
]
CLIP_START, CLIP_END = 0, 28_400


def candidate(
    number: int, phrase: str = "", keywords: tuple[str, ...] = ("coins",)
) -> SlotCandidate:
    return SlotCandidate(number, phrase, "  Celengan   di meja ", list(keywords))


def test_anchor_matches_phrase_ignoring_case_and_punctuation() -> None:
    words = anchor_words(SENTENCES[1], "Celengan BABI,")
    assert [w.text for w in words] == ["celengan", "babi"]
    # Frasa tidak ada di kalimat → seluruh kalimat.
    assert anchor_words(SENTENCES[1], "piggy bank") == SENTENCES[1].words
    assert anchor_words(SENTENCES[1], " ,. ") == SENTENCES[1].words


def test_keywords_trimmed_deduplicated_and_capped() -> None:
    assert clean_keywords(["  piggy   bank ", "Piggy Bank", "", "coins", "jar", "wallet"]) == (
        "piggy bank",
        "coins",
        "jar",
    )


def test_resolve_starts_at_phrase_with_min_and_max_length() -> None:
    slot = resolve_slot(candidate(2, "celengan babi"), SENTENCES, CLIP_START, CLIP_END)
    # "celengan" = kata ke-3 (5,8 dtk); frasa 0,8 dtk → diperpanjang ke durasi minimum.
    assert slot == BrollSlot(
        5_800,
        5_800 + MIN_SLOT_MS,
        2,
        "Coba lihat celengan babi di meja kamu.",
        "Celengan di meja",
        ("coins",),
    )
    long = resolve_slot(
        candidate(4, "Mulai sekarang catat semua pengeluaran harian."),
        [sentence(4, 20_000, "Mulai sekarang catat semua pengeluaran harian.", word_ms=1_500)],
        CLIP_START,
        60_000,
    )
    assert isinstance(long, BrollSlot)
    assert long.end_ms - long.start_ms == MAX_SLOT_MS
    # Dipotong di akhir klip.
    end = resolve_slot(candidate(4, "harian"), SENTENCES, CLIP_START, 22_500)
    assert end == "too_short"


def test_resolve_rejects_unusable_candidates() -> None:
    assert resolve_slot(candidate(9), SENTENCES, CLIP_START, CLIP_END) == "unknown_sentence"
    assert resolve_slot(candidate(2, keywords=(" ",)), SENTENCES, CLIP_START, CLIP_END) == (
        "no_keywords"
    )
    # Kalimat pertama = pembuka klip.
    assert resolve_slot(candidate(1), SENTENCES, CLIP_START, CLIP_END) == "in_hook"
    # Pembuka dihitung dari awal klip, bukan dari 0.
    assert resolve_slot(candidate(2), SENTENCES, 4_000, CLIP_END) == "in_hook"


def test_select_keeps_order_priority_drops_overlaps_and_sorts_by_time() -> None:
    plan = select_slots(
        [
            candidate(3, "kopi"),
            # Tumpang-tindih / terlalu dekat dengan slot "kopi" (13,2 dtk).
            candidate(3, "setiap pagi"),
            candidate(2, "celengan"),
            candidate(1),
            candidate(4, "catat"),
            candidate(9),
        ],
        SENTENCES,
        CLIP_START,
        CLIP_END,
    )
    assert [(s.sentence, s.start_ms) for s in plan.slots] == [(2, 5_800), (3, 13_200), (4, 20_800)]
    assert plan.rejected == {"overlap": 1, "in_hook": 1, "unknown_sentence": 1}


def test_select_caps_slot_count() -> None:
    many = [sentence(n, n * 10_000, f"kata ke {n} di sini") for n in range(1, 9)]
    plan = select_slots([candidate(n) for n in range(2, 9)], many, 10_000, 90_000)
    assert len(plan.slots) == 4
    assert [s.sentence for s in plan.slots] == [2, 3, 4, 5]
