"""Caption & hashtag posting: aturan merapikan keluaran Gemini.

Gemini hanya menulis; panjang caption, bentuk hashtag, dan duplikatnya dijaga di sini supaya
hasil yang tampil di UI selalu bisa langsung disalin ke aplikasi platform."""

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

Platform = Literal["tiktok", "reels", "shorts"]
PLATFORMS: tuple[Platform, ...] = ("tiktok", "reels", "shorts")

MAX_HASHTAGS = 5
MAX_HASHTAG_CHARS = 30

# Caption pendek lebih sering terbaca penuh; Shorts memakai judul (maks 100 karakter di YouTube).
MAX_CAPTION_CHARS: dict[Platform, int] = {"tiktok": 150, "reels": 150, "shorts": 100}

_ELLIPSIS = "…"
_HASHTAG_IN_TEXT = re.compile(r"(?<!\w)#\w+", re.UNICODE)
_WHITESPACE = re.compile(r"\s+")
# Sisa spasi sebelum tanda baca setelah hashtag dibuang ("Halo #tips." → "Halo .").
_SPACE_BEFORE_PUNCTUATION = re.compile(r"\s+([.,!?;:])")


@dataclass(frozen=True)
class PostCopy:
    caption: str
    # Varian kedua untuk uji A/B; kosong bila Gemini tidak memberinya.
    alt_caption: str
    hashtags: tuple[str, ...]


def normalize_hashtag(raw: str) -> str | None:
    """`" #Tips Hemat! "` → `"#tipshemat"`; `None` bila tidak ada isi yang bisa dipakai.

    Hanya huruf, angka, dan garis bawah yang dipertahankan (hashtag platform berhenti di tanda
    baca atau spasi). Hashtag berisi angka saja tidak dihitung: platform tidak menautkannya."""
    body = "".join(ch for ch in raw if ch.isalnum() or ch == "_").lower()
    body = body[:MAX_HASHTAG_CHARS]
    if not body or body.isdigit():
        return None
    return f"#{body}"


def clean_hashtags(raw: Sequence[str], limit: int = MAX_HASHTAGS) -> list[str]:
    """Hashtag valid, tanpa duplikat, urutan Gemini dipertahankan, paling banyak `limit`."""
    result: list[str] = []
    for item in raw:
        tag = normalize_hashtag(item)
        if tag is not None and tag not in result:
            result.append(tag)
        if len(result) == limit:
            break
    return result


def clean_caption(text: str, max_chars: int) -> str:
    """Caption satu paragraf tanpa hashtag (hashtag ditampilkan terpisah), dipangkas di batas
    kata bila melebihi `max_chars` (hasil akhir, termasuk tanda potong, tidak melebihi itu)."""
    spaced = _WHITESPACE.sub(" ", _HASHTAG_IN_TEXT.sub("", text))
    cleaned = _SPACE_BEFORE_PUNCTUATION.sub(r"\1", spaced).strip()
    if len(cleaned) <= max_chars:
        return cleaned
    room = max_chars - len(_ELLIPSIS)
    cut = cleaned[:room]
    # Pangkas di spasi terakhir kecuali kata pertama sendiri sudah melebihi batas.
    if " " in cut and not cleaned[room].isspace():
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:.-") + _ELLIPSIS


def build_post_copy(
    caption: str,
    alt_caption: str,
    hashtags: Sequence[str],
    platform: Platform,
) -> PostCopy:
    limit = MAX_CAPTION_CHARS[platform]
    main = clean_caption(caption, limit)
    alt = clean_caption(alt_caption, limit)
    # Varian yang sama dengan caption utama (selain huruf besar/kecil) tidak berguna untuk A/B.
    if alt.casefold() == main.casefold():
        alt = ""
    return PostCopy(main, alt, tuple(clean_hashtags(hashtags)))
