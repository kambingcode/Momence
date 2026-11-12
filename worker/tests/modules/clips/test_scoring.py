from clipstudio_worker.modules.clips.application import DiscoveredClip, Subscore, SubscoreName
from clipstudio_worker.modules.clips.domain.scoring import (
    display_score,
    rank_clips,
    raw_score,
)


def clip(start_ms: int, *values: int) -> DiscoveredClip:
    names: tuple[SubscoreName, ...] = ("hook", "flow", "value", "trend")
    subscores: dict[SubscoreName, Subscore] = {
        name: Subscore(v, "") for name, v in zip(names, values, strict=True)
    }
    return DiscoveredClip("t", "h", start_ms, start_ms + 30_000, "a", "b", subscores)


def test_raw_score_is_mean_of_subscores() -> None:
    assert raw_score(clip(0, 8, 7, 6, 4)) == 6.25
    assert raw_score(clip(0, 10, 10, 10, 10)) == 10
    assert raw_score(DiscoveredClip("t", "h", 0, 30_000, "a", "b", {})) == 0


def test_display_score_spreads_ranks_linearly_from_99_to_60() -> None:
    assert display_score(0, 1) == 99
    assert [display_score(p, 2) for p in range(2)] == [99, 60]
    # 99 − 39·p/3 = 99, 86, 73, 60
    assert [display_score(p, 4) for p in range(4)] == [99, 86, 73, 60]
    # 99 − 39/2 = 79,5 → dibulatkan ke atas (bukan pembulatan bankir Python).
    assert display_score(1, 3) == 80
    scores = [display_score(p, 50) for p in range(50)]
    assert scores == sorted(scores, reverse=True)
    assert (scores[0], scores[-1]) == (99, 60)


def test_rank_clips_orders_by_raw_score_then_earlier_clip() -> None:
    ranked = rank_clips(
        [
            clip(0, 5, 5, 5, 5),
            clip(60_000, 9, 9, 9, 9),
            clip(120_000, 7, 7, 7, 7),
            clip(30_000, 7, 7, 7, 7),
        ]
    )
    assert [(r.clip.start_ms, r.raw_score, r.score, r.rank) for r in ranked] == [
        (60_000, 9, 99, 1),
        # Seri raw_score → skor sama, peringkat tetap unik (yang lebih awal dulu).
        (30_000, 7, 86, 2),
        (120_000, 7, 86, 3),
        (0, 5, 60, 4),
    ]


def test_rank_clips_single_and_empty() -> None:
    [only] = rank_clips([clip(0, 1, 1, 1, 1)])
    assert (only.score, only.rank) == (99, 1)
    assert rank_clips([]) == []
