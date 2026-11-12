import pytest

from clipstudio_worker.modules.social.application import (
    MAX_CAPTION_CHARS,
    MAX_HASHTAGS,
    build_post_copy,
    clean_caption,
    clean_hashtags,
    normalize_hashtag,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("#TipsHemat", "#tipshemat"),
        ("  ##Tips Hemat! ", "#tipshemat"),
        ("dana_darurat", "#dana_darurat"),
        ("#Keuangan2026", "#keuangan2026"),
        ("#belajarAI🔥", "#belajarai"),
        ("#", None),
        ("   ", None),
        ("#2026", None),
        ("!!!", None),
    ],
)
def test_normalize_hashtag(raw: str, expected: str | None) -> None:
    assert normalize_hashtag(raw) == expected


def test_hashtag_is_capped_in_length() -> None:
    tag = normalize_hashtag("a" * 80)
    assert tag == "#" + "a" * 30


def test_clean_hashtags_drops_invalid_and_duplicates_keeping_order() -> None:
    raw = ["#Nabung", "nabung", "#2026", "", "#GajiKecil", "#Nabung!", "#a", "#b", "#c", "#d"]
    assert clean_hashtags(raw) == ["#nabung", "#gajikecil", "#a", "#b", "#c"]


def test_clean_hashtags_respects_limit() -> None:
    raw = [f"tag{i}" for i in range(10)]
    assert len(clean_hashtags(raw)) == MAX_HASHTAGS
    assert clean_hashtags(raw, limit=2) == ["#tag0", "#tag1"]


def test_caption_strips_hashtags_and_collapses_whitespace() -> None:
    text = "  Rahasia  nabung\n#TipsHemat gaji kecil #fyp "
    assert clean_caption(text, 150) == "Rahasia nabung gaji kecil"


def test_caption_closes_gap_left_before_punctuation() -> None:
    text = "Rahasia nabung #tips. Coba #hemat, ya!"
    assert clean_caption(text, 150) == "Rahasia nabung. Coba, ya!"


def test_caption_keeps_hash_inside_words() -> None:
    assert clean_caption("Level C# dasar dan #1 trik", 150) == "Level C# dasar dan trik"


def test_caption_within_limit_is_untouched() -> None:
    assert clean_caption("x" * 100, 100) == "x" * 100


def test_long_caption_is_cut_at_word_boundary_within_limit() -> None:
    text = "satu dua tiga empat lima enam tujuh delapan sembilan sepuluh"
    result = clean_caption(text, 30)
    assert result == "satu dua tiga empat lima enam…"
    assert len(result) <= 30


def test_long_caption_without_spaces_is_hard_cut() -> None:
    result = clean_caption("x" * 50, 20)
    assert result == "x" * 19 + "…"


def test_cut_does_not_leave_trailing_punctuation() -> None:
    result = clean_caption("Halo semua, ini rahasia besar nabung banget", 20)
    assert result == "Halo semua, ini…"


def test_build_post_copy_applies_platform_limit() -> None:
    long = "kata " * 60
    shorts = build_post_copy(long, "", ["#a"], "shorts")
    tiktok = build_post_copy(long, "", ["#a"], "tiktok")
    assert len(shorts.caption) <= MAX_CAPTION_CHARS["shorts"]
    assert len(tiktok.caption) <= MAX_CAPTION_CHARS["tiktok"]
    assert len(shorts.caption) < len(tiktok.caption)


def test_alt_caption_equal_to_main_is_dropped() -> None:
    same = build_post_copy("Sama saja", "sama   saja #x", ["#a"], "tiktok")
    assert (same.caption, same.alt_caption) == ("Sama saja", "")
    different = build_post_copy("Sama saja", "Beda sudut", ["#a"], "tiktok")
    assert different.alt_caption == "Beda sudut"


def test_build_post_copy_collects_clean_hashtags() -> None:
    copy = build_post_copy("Caption", "Varian", ["#Nabung", "nabung", "Gaji Kecil"], "reels")
    assert (copy.caption, copy.alt_caption) == ("Caption", "Varian")
    assert copy.hashtags == ("#nabung", "#gajikecil")
