"""Skor klip: `raw_score` (rata-rata subskor 0–10) → skor tampilan 60–99 berbasis peringkat."""

import math
from collections.abc import Iterable
from dataclasses import dataclass

from clipstudio_worker.modules.clips.domain.clip import DiscoveredClip

DISPLAY_SCORE_MIN = 60
DISPLAY_SCORE_MAX = 99


@dataclass(frozen=True)
class RankedClip:
    clip: DiscoveredClip
    raw_score: float
    # 60–99; klip dengan raw_score sama mendapat skor sama.
    score: int
    # 1 = terbaik; selalu unik (seri → klip yang lebih awal di video).
    rank: int


def raw_score(clip: DiscoveredClip) -> float:
    if not clip.subscores:
        return 0.0
    return clip.subscore_total / len(clip.subscores)


def display_score(position: int, count: int) -> int:
    """Peringkat (`position` 0 = terbaik dari `count` klip) dipetakan linear ke 99…60.
    Satu-satunya klip → 99. Pembulatan setengah ke atas."""
    if count <= 1:
        return DISPLAY_SCORE_MAX
    span = DISPLAY_SCORE_MAX - DISPLAY_SCORE_MIN
    return math.floor(DISPLAY_SCORE_MAX - span * position / (count - 1) + 0.5)


def rank_clips(clips: Iterable[DiscoveredClip]) -> list[RankedClip]:
    """Urutkan dari raw_score tertinggi (seri → lebih awal) lalu beri skor & peringkat.
    Skor relatif terhadap klip lain dari video yang sama, bukan nilai mutlak."""
    ordered = sorted(clips, key=lambda c: (-raw_score(c), c.start_ms, c.end_ms))
    ranked: list[RankedClip] = []
    for position, clip in enumerate(ordered):
        raw = raw_score(clip)
        if ranked and ranked[-1].raw_score == raw:
            score = ranked[-1].score
        else:
            score = display_score(position, len(ordered))
        ranked.append(RankedClip(clip, raw, score, position + 1))
    return ranked
