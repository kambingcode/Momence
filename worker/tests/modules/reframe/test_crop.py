from itertools import pairwise

import pytest

from clipstudio_worker.modules.reframe.domain.analysis import ClipAnalysis, FaceBox, FaceSample
from clipstudio_worker.modules.reframe.domain.crop import (
    CropKeyframe,
    CropRect,
    crop_size,
    crop_track,
    crop_tracks,
    face_tracks,
    simplify,
    smooth,
    subject_centers,
)

ASPECT = 16 / 9


def face(cx: float, size: float = 0.1, score: float = 0.9, cy: float = 0.4) -> FaceBox:
    """Wajah persegi (di piksel) berpusat di (cx, cy)."""
    width = size / ASPECT
    return FaceBox(cx - width / 2, cy - size / 2, width, size, score)


def analysis(
    faces: list[list[FaceBox]], cuts: tuple[int, ...] = (), width: int = 1920, height: int = 1080
) -> ClipAnalysis:
    samples = tuple(FaceSample(1_000 + i * 200, tuple(f)) for i, f in enumerate(faces))
    return ClipAnalysis(1_000, 1_000 + len(faces) * 200, width, height, samples, cuts)


def x_at(keyframes: list[CropKeyframe], t_ms: int) -> float:
    if t_ms <= keyframes[0].t_ms:
        return keyframes[0].rect.x
    for a, b in pairwise(keyframes):
        if a.t_ms <= t_ms <= b.t_ms:
            return a.rect.x + (b.rect.x - a.rect.x) * (t_ms - a.t_ms) / (b.t_ms - a.t_ms)
    return keyframes[-1].rect.x


def test_crop_size_is_largest_window_of_ratio() -> None:
    assert crop_size(1920, 1080, (9, 16)) == pytest.approx((0.3164, 1.0), abs=1e-4)
    assert crop_size(1920, 1080, (1, 1)) == pytest.approx((0.5625, 1.0))
    assert crop_size(1920, 1080, (16, 9)) == (1.0, 1.0)
    assert crop_size(1080, 1920, (16, 9)) == pytest.approx((1.0, 0.3164), abs=1e-4)
    assert crop_size(1280, 534, (16, 9)) == pytest.approx((0.7416, 1.0), abs=1e-4)


def test_smooth_ignores_moves_inside_dead_zone_and_eases_outside() -> None:
    assert smooth([0.5, 0.52, 0.48, 0.53], dead_zone=0.05) == [0.5] * 4
    moved = smooth([0.5, *[0.8] * 12, 0.76, 0.8, 0.77], dead_zone=0.05)
    # Mendekat bertahap tanpa melampaui sampai dalam ½ dead-zone, lalu guncangan kecil diabaikan.
    assert moved == sorted(moved)
    assert moved[1] < 0.7
    assert 0.8 - 0.05 * 0.5 <= moved[12] < 0.8
    assert moved[12:] == [moved[12]] * 4
    assert smooth([], dead_zone=0.05) == []


def test_tracks_link_nearby_faces_and_split_far_or_long_gaps() -> None:
    near, far = face(0.30), face(0.80)
    samples = [[near, far], [face(0.31), far], [], [face(0.32)], *[[]] * 6, [face(0.33)]]

    tracks = face_tracks(samples, ASPECT)

    # 0,30 → 0,31 → (celah 1) → 0,32 satu track; kemunculan lagi setelah celah > 1 dtk = baru.
    assert sorted(sorted(t.boxes) for t in tracks) == [[0, 1], [0, 1, 3], [10]]


def test_subject_is_heaviest_track_and_stays_through_short_gaps() -> None:
    big, small = face(0.3, size=0.2), face(0.7, size=0.08)
    samples = [[big, small]] * 4 + [[small]] + [[big, small]] * 4 + [[small]] * 3

    centers = subject_centers(samples, ASPECT)

    # Celah 1 sampel pada wajah besar tidak memindahkan crop ke wajah kecil; setelah wajah besar
    # benar-benar hilang, wajah kecil (track ke-2) dipakai.
    assert [round(c[0], 2) if c else None for c in centers] == [0.3] * 9 + [0.7] * 3


def test_short_false_detection_is_not_a_subject() -> None:
    samples: list[list[FaceBox]] = [[], [face(0.9)], [face(0.9)], [], []]
    assert subject_centers(samples, ASPECT) == [None] * 5


def test_crop_follows_subject_holds_on_jitter_and_jumps_at_cut() -> None:
    walk = [[face(0.2 + 0.02 * i)] for i in range(20)]  # 4 dtk menyeberang ke kanan
    jitter = [[face(0.6 + (0.006 if i % 2 else -0.006))] for i in range(10)]
    after_cut = [[face(0.15)] for _ in range(10)]
    clip = analysis(walk + jitter + after_cut, cuts=(7_000,))

    keyframes = crop_track(clip, (9, 16))

    width = keyframes[0].rect.width
    assert {(k.rect.width, k.rect.height, k.rect.y) for k in keyframes} == {(width, 1.0, 0.0)}
    for sample in clip.samples:
        x = x_at(keyframes, sample.t_ms)
        f = sample.faces[0]
        assert x - 1e-3 <= f.x and f.x + f.width <= x + width + 1e-3, sample.t_ms
    # Selama jitter (5–7 dtk) crop tidak bolak-balik: hanya menyelesaikan gerak ke kanan lalu diam.
    jitter_x = [x_at(keyframes, t) for t in range(5_000, 7_000, 200)]
    assert jitter_x == sorted(jitter_x)
    assert len({round(x, 4) for x in jitter_x[-4:]}) == 1
    assert [k.t_ms for k in keyframes if 6_990 <= k.t_ms <= 7_000] == [6_999, 7_000]
    assert x_at(keyframes, 6_999) > 0.3
    assert x_at(keyframes, 7_000) == 0.0  # 0,15 − ½ lebar crop < 0 → dijepit ke tepi kiri


def test_no_faces_falls_back_to_center_and_crop_stays_in_frame() -> None:
    assert crop_track(analysis([[]] * 10), (9, 16)) == [
        CropKeyframe(1_000, CropRect(0.3418, 0.0, 0.3164, 1.0)),
        CropKeyframe(2_800, CropRect(0.3418, 0.0, 0.3164, 1.0)),
    ]
    edge = crop_track(analysis([[face(0.99, size=0.05)]] * 10), (9, 16))
    assert {k.rect.x for k in edge} == {0.6836}  # dijepit ke tepi kanan


def test_portrait_source_pans_vertically_with_headroom() -> None:
    clip = analysis([[face(0.5, size=0.05, cy=0.3)]] * 5, width=1080, height=1920)

    keyframes = crop_track(clip, (16, 9))

    rect = keyframes[0].rect
    assert (rect.x, rect.width) == (0.0, 1.0)
    # Wajah di 40 % tinggi crop.
    assert (0.3 - rect.y) / rect.height == pytest.approx(0.4, abs=0.01)


def test_same_ratio_as_source_needs_no_crop() -> None:
    tracks = crop_tracks(analysis([[face(0.3)]] * 5))
    assert tracks["16:9"] == []
    assert set(tracks) == {"9:16", "1:1", "16:9"}


def test_simplify_keeps_shape_within_tolerance() -> None:
    def key(t: int, x: float) -> CropKeyframe:
        return CropKeyframe(t, CropRect(x, 0, 0.3, 1))

    still = [key(t, 0.4) for t in range(0, 1_000, 200)]
    assert simplify(still) == [still[0], still[-1]]
    ramp = [key(0, 0.1), key(100, 0.2), key(200, 0.3), key(300, 0.3), key(399, 0.3), key(400, 0.6)]
    assert [k.t_ms for k in simplify(ramp)] == [0, 200, 399, 400]
