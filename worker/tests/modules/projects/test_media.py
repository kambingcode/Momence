from clipstudio_worker.modules.projects.domain.media import (
    display_size,
    parse_frame_rate,
    proxy_frame_rate,
    proxy_size,
)


def test_parse_frame_rate() -> None:
    assert parse_frame_rate("30000/1001") == 29.97
    assert parse_frame_rate("25/1") == 25.0
    assert parse_frame_rate("60") == 60.0
    assert parse_frame_rate("0/0") is None
    assert parse_frame_rate("") is None
    assert parse_frame_rate(None) is None
    assert parse_frame_rate("abc") is None


def test_display_size_swaps_for_portrait_rotation() -> None:
    assert display_size(1920, 1080, -90) == (1080, 1920)
    assert display_size(1920, 1080, 270) == (1080, 1920)
    assert display_size(1920, 1080, 180) == (1920, 1080)
    assert display_size(1920, 1080, 0) == (1920, 1080)


def test_proxy_size_limits_short_side_to_720_and_keeps_even() -> None:
    assert proxy_size(1920, 1080) == (1280, 720)
    assert proxy_size(1080, 1920) == (720, 1280)
    assert proxy_size(3840, 2160) == (1280, 720)
    # Tidak di-upscale.
    assert proxy_size(640, 360) == (640, 360)
    # Ukuran ganjil dibulatkan ke genap.
    assert proxy_size(1918, 1078) == (1282, 720)
    assert proxy_size(853, 480) == (854, 480)


def test_proxy_frame_rate_divides_high_frame_rates_evenly() -> None:
    assert proxy_frame_rate(60) == 30
    assert proxy_frame_rate(59.94) == 29.97
    assert proxy_frame_rate(50) == 25
    assert proxy_frame_rate(120) == 30
    assert proxy_frame_rate(144) == 28.8
    assert proxy_frame_rate(48) == 24
    # Sudah ≤ 30 fps (termasuk pembulatan probe) atau tidak diketahui → frame rate sumber.
    for fps in (30, 30.001, 29.97, 25, 24, 15, None):
        assert proxy_frame_rate(fps) is None
