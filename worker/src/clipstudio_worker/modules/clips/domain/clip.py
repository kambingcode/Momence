"""Kandidat klip dari Gemini → klip tervalidasi (batas kalimat, durasi 15–90 dtk) → dedup."""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

from clipstudio_worker.modules.clips.domain.sentences import Sentence

MIN_CLIP_MS = 15_000
MAX_CLIP_MS = 90_000
SCORE_MIN = 0
SCORE_MAX = 10
# Dua klip dianggap duplikat bila tumpang-tindihnya ≥ separuh durasi klip yang lebih pendek.
DUPLICATE_OVERLAP_RATIO = 0.5
# Kata kunci yang disorot caption, paling banyak sekian per klip.
MAX_KEYWORDS = 6

SubscoreName = Literal["hook", "flow", "value", "trend"]
SUBSCORE_NAMES: tuple[SubscoreName, ...] = ("hook", "flow", "value", "trend")

RejectReason = Literal["unknown_sentence", "reversed", "too_short", "too_long", "empty_title"]


@dataclass(frozen=True)
class Subscore:
    score: int
    comment: str


@dataclass(frozen=True)
class ClipCandidate:
    """Usulan mentah Gemini: batas berupa nomor kalimat (inklusif)."""

    start_sentence: int
    end_sentence: int
    title: str
    hook: str
    subscores: Mapping[SubscoreName, Subscore]
    # Kata penting yang disorot caption, ditulis seperti di transkrip.
    keywords: Sequence[str] = ()


@dataclass(frozen=True)
class DiscoveredClip:
    title: str
    hook: str
    start_ms: int
    end_ms: int
    start_token_id: str
    end_token_id: str
    subscores: Mapping[SubscoreName, Subscore]
    # Kunci kata (`keyword_key`) yang ada di klip, urut usulan Gemini.
    keywords: tuple[str, ...] = ()

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms

    @property
    def subscore_total(self) -> int:
        return sum(s.score for s in self.subscores.values())


def clamp_score(score: int) -> int:
    return max(SCORE_MIN, min(SCORE_MAX, score))


def keyword_key(text: str) -> str:
    """Cermin `wordKey` web: huruf kecil, tanpa tanda baca di tepi ("“Nabung,”" → "nabung")."""
    start, end = 0, len(text)
    while start < end and not text[start].isalnum():
        start += 1
    while end > start and not text[end - 1].isalnum():
        end -= 1
    return text[start:end].lower()


def clip_keywords(keywords: Iterable[str], sentences: Iterable[Sentence]) -> tuple[str, ...]:
    """Kata kunci usulan yang benar-benar diucapkan di klip, sebagai kunci kata tunggal; ganda &
    frasa multi-kata dibuang, paling banyak `MAX_KEYWORDS`."""
    spoken = {keyword_key(word) for s in sentences for word in s.text.split()}
    result: list[str] = []
    for keyword in keywords:
        key = keyword_key(keyword)
        if key and key in spoken and key not in result:
            result.append(key)
    return tuple(result[:MAX_KEYWORDS])


def resolve_candidate(
    candidate: ClipCandidate, window: Sequence[Sentence]
) -> DiscoveredClip | RejectReason:
    """Petakan nomor kalimat ke waktu; subskor dijepit ke 0–10. Ditolak: nomor di luar jendela,
    urutan terbalik, tanpa judul, atau durasi di luar 15–90 dtk. Klip terlalu panjang tidak
    dipangkas: judul, hook & skor Gemini menilai seluruh rentang (termasuk punchline di ujung)."""
    by_number = {s.number: s for s in window}
    first = by_number.get(candidate.start_sentence)
    last = by_number.get(candidate.end_sentence)
    if first is None or last is None:
        return "unknown_sentence"
    if last.number < first.number:
        return "reversed"
    title = candidate.title.strip()
    if not title:
        return "empty_title"

    duration = last.end_ms - first.start_ms
    if duration < MIN_CLIP_MS:
        return "too_short"
    if duration > MAX_CLIP_MS:
        return "too_long"

    return DiscoveredClip(
        title=title,
        hook=candidate.hook.strip(),
        start_ms=first.start_ms,
        end_ms=last.end_ms,
        start_token_id=first.first_token_id,
        end_token_id=last.last_token_id,
        subscores={
            name: Subscore(clamp_score(s.score), s.comment.strip())
            for name, s in candidate.subscores.items()
        },
        keywords=clip_keywords(
            candidate.keywords,
            (s for s in window if first.number <= s.number <= last.number),
        ),
    )


def overlap_ratio(a: DiscoveredClip, b: DiscoveredClip) -> float:
    overlap = min(a.end_ms, b.end_ms) - max(a.start_ms, b.start_ms)
    if overlap <= 0:
        return 0.0
    return overlap / min(a.duration_ms, b.duration_ms)


def without_overlaps(
    clips: Iterable[DiscoveredClip], kept: Sequence[DiscoveredClip]
) -> list[DiscoveredClip]:
    """Buang klip yang menduplikasi klip yang dipertahankan (sudah diedit pengguna):
    versi yang sudah diedit selalu menang."""
    return [
        clip
        for clip in clips
        if all(overlap_ratio(clip, other) < DUPLICATE_OVERLAP_RATIO for other in kept)
    ]


def remove_duplicates(clips: Iterable[DiscoveredClip]) -> list[DiscoveredClip]:
    """Dari klip yang saling tumpang-tindih besar, simpan yang total subskornya tertinggi
    (seri → yang lebih awal). Hasil urut kronologis."""
    ranked = sorted(clips, key=lambda c: (-c.subscore_total, c.start_ms, c.end_ms))
    kept: list[DiscoveredClip] = []
    for clip in ranked:
        if all(overlap_ratio(clip, other) < DUPLICATE_OVERLAP_RATIO for other in kept):
            kept.append(clip)
    return sorted(kept, key=lambda c: (c.start_ms, c.end_ms))
