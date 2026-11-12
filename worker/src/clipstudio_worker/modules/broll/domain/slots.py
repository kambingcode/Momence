"""Slot B-roll: rentang pendek di klip tempat video stok menutupi pembicara.

Gemini menunjuk kalimat + frasa jangkar; aturan di sini mengubahnya menjadi rentang waktu (ms
video sumber) yang aman: tidak menutupi pembuka klip, panjang 2–5 detik, tidak tumpang-tindih.
"""

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

MIN_SLOT_MS = 2_000
MAX_SLOT_MS = 5_000
# Pembuka klip (hook) tetap menampilkan pembicara: penonton perlu melihat siapa yang bicara.
HOOK_GUARD_MS = 3_000
# Jarak minimum antar-slot agar pembicara sempat terlihat lagi.
MIN_GAP_MS = 1_500
MAX_SLOTS = 4
MAX_KEYWORDS = 3

RejectReason = Literal["unknown_sentence", "no_keywords", "in_hook", "too_short", "overlap"]


@dataclass(frozen=True)
class SpokenWord:
    text: str
    start_ms: int
    end_ms: int


@dataclass(frozen=True)
class SpokenSentence:
    # Nomor kalimat di dalam klip (mulai 1), sama dengan yang dilihat Gemini.
    number: int
    text: str
    words: Sequence[SpokenWord]


@dataclass(frozen=True)
class SlotCandidate:
    """Usulan mentah dari LLM."""

    sentence: int
    # Beberapa kata berurutan dari kalimat itu, tempat B-roll mulai.
    phrase: str
    intent: str
    keywords: Sequence[str]


@dataclass(frozen=True)
class BrollSlot:
    start_ms: int
    end_ms: int
    sentence: int
    # Teks kalimat (untuk ditampilkan di panel B-roll).
    text: str
    intent: str
    # Kata kunci pencarian video stok (bahasa Inggris).
    keywords: tuple[str, ...]


@dataclass(frozen=True)
class SlotPlan:
    slots: list[BrollSlot]
    rejected: Counter[RejectReason]


def _word_key(text: str) -> str:
    return "".join(ch for ch in text.casefold() if ch.isalnum())


def anchor_words(sentence: SpokenSentence, phrase: str) -> Sequence[SpokenWord]:
    """Kata-kata frasa jangkar di kalimat (perbandingan tanpa huruf besar & tanda baca).

    Frasa tidak ditemukan → seluruh kalimat (B-roll mulai di awal kalimat).
    """
    keys = [_word_key(w.text) for w in sentence.words]
    wanted = [k for k in (_word_key(part) for part in phrase.split()) if k]
    if wanted:
        for i in range(len(keys) - len(wanted) + 1):
            if keys[i : i + len(wanted)] == wanted:
                return sentence.words[i : i + len(wanted)]
    return sentence.words


def clean_keywords(keywords: Sequence[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    result: list[str] = []
    for keyword in keywords:
        text = " ".join(keyword.split())
        if text and text.casefold() not in seen:
            seen.add(text.casefold())
            result.append(text)
    return tuple(result[:MAX_KEYWORDS])


def resolve_slot(
    candidate: SlotCandidate,
    sentences: Sequence[SpokenSentence],
    clip_start_ms: int,
    clip_end_ms: int,
) -> BrollSlot | RejectReason:
    sentence = next((s for s in sentences if s.number == candidate.sentence), None)
    if sentence is None or not sentence.words:
        return "unknown_sentence"
    keywords = clean_keywords(candidate.keywords)
    if not keywords:
        return "no_keywords"
    anchor = anchor_words(sentence, candidate.phrase)
    start = anchor[0].start_ms
    if start < clip_start_ms + HOOK_GUARD_MS:
        return "in_hook"
    # Frasa pendek tetap mendapat B-roll yang cukup lama untuk terbaca; frasa panjang dipotong.
    end = min(max(anchor[-1].end_ms, start + MIN_SLOT_MS), start + MAX_SLOT_MS, clip_end_ms)
    if end - start < MIN_SLOT_MS:
        return "too_short"
    return BrollSlot(
        start_ms=start,
        end_ms=end,
        sentence=sentence.number,
        text=sentence.text,
        intent=" ".join(candidate.intent.split()),
        keywords=keywords,
    )


def select_slots(
    candidates: Sequence[SlotCandidate],
    sentences: Sequence[SpokenSentence],
    clip_start_ms: int,
    clip_end_ms: int,
) -> SlotPlan:
    """Slot valid sesuai urutan usulan (yang lebih dulu diutamakan), paling banyak `MAX_SLOTS`,
    tanpa tumpang-tindih & berjarak ≥ `MIN_GAP_MS`; hasil diurutkan menurut waktu."""
    kept: list[BrollSlot] = []
    rejected: Counter[RejectReason] = Counter()
    for candidate in candidates:
        if len(kept) == MAX_SLOTS:
            break
        slot = resolve_slot(candidate, sentences, clip_start_ms, clip_end_ms)
        if isinstance(slot, str):
            rejected[slot] += 1
        elif any(
            slot.start_ms < other.end_ms + MIN_GAP_MS and other.start_ms < slot.end_ms + MIN_GAP_MS
            for other in kept
        ):
            rejected["overlap"] += 1
        else:
            kept.append(slot)
    return SlotPlan(sorted(kept, key=lambda s: s.start_ms), rejected)
