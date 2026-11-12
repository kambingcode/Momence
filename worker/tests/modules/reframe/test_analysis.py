import pytest

from clipstudio_worker.modules.reframe.domain.analysis import (
    FACE_FPS,
    FaceBox,
    analysis_size,
    clamp_box,
    expected_frames,
    frame_time_ms,
    scene_cuts_ms,
)


def test_face_samples_are_five_per_second() -> None:
    assert FACE_FPS == 5


def test_analysis_size_keeps_aspect_with_even_sides_without_upscaling() -> None:
    assert analysis_size(1920, 1080) == (640, 360)
    assert analysis_size(1080, 1920) == (360, 640)  # potret: sisi panjang = tinggi
    assert analysis_size(1280, 534) == (640, 268)  # 266,9 → genap terdekat
    assert analysis_size(320, 240) == (320, 240)


def test_frame_schedule_starts_at_clip_start() -> None:
    assert frame_time_ms(10_000, 0) == 10_000
    assert frame_time_ms(10_000, 1) == 10_067
    assert frame_time_ms(10_000, 15) == 11_000
    assert expected_frames(10_000, 11_000) == 15
    assert expected_frames(10_000, 11_010) == 16
    assert expected_frames(10_000, 10_000) == 0


def test_clamp_box_cuts_to_frame_and_drops_empty() -> None:
    clamped = clamp_box(FaceBox(-0.1, 0.5, 0.3, 0.7, 0.9))
    assert clamped is not None
    assert (clamped.x, clamped.y, clamped.width, clamped.height, clamped.score) == pytest.approx(
        (0.0, 0.5, 0.2, 0.5, 0.9)
    )
    inside = FaceBox(0.2, 0.2, 0.1, 0.1, 0.8)
    assert clamp_box(inside) is inside
    assert clamp_box(FaceBox(1.1, 0.2, 0.1, 0.1, 0.8)) is None


def test_scene_cuts_become_unique_sorted_source_times_inside_clip() -> None:
    # Frame 0 = awal klip (bukan cut); cut di akhir klip tidak berguna.
    assert scene_cuts_ms(5_000, 9_000, [45, 15, 15, 0, 60]) == (6_000, 8_000)
