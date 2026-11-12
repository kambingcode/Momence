import signal
import threading
import time

import pytest

from clipstudio_worker.cli import TWIN_SIGNAL_S, Heartbeat, StopRequest


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def test_first_signal_requests_stop_and_twin_is_ignored() -> None:
    clock, written = FakeClock(), list[str]()
    stop = StopRequest(clock, written.append)
    stop.handle(signal.SIGINT, None)
    assert stop.requested
    assert written == ["Berhenti setelah job ini (SIGINT); Ctrl+C lagi = berhenti paksa.\n"]
    clock.now += TWIN_SIGNAL_S / 2
    stop.handle(signal.SIGTERM, None)  # kembaran dari `uv run`
    assert len(written) == 1


def test_deliberate_second_signal_forces_exit() -> None:
    clock = FakeClock()
    stop = StopRequest(clock, lambda _: None)
    stop.handle(signal.SIGINT, None)
    clock.now += TWIN_SIGNAL_S + 0.1
    with pytest.raises(KeyboardInterrupt):
        stop.handle(signal.SIGINT, None)


def test_signal_arriving_inside_the_handler_does_not_deadlock_or_force_exit() -> None:
    """Sinyal kedua (kembaran `uv run`) bisa tiba di tengah handler pertama; dulu keduanya
    menunggu lock logger/Event yang dipegang thread yang sama → worker macet."""
    clock = FakeClock()
    nested: list[str] = []

    def write(text: str) -> None:
        nested.append(text)
        if len(nested) == 1:
            stop.handle(signal.SIGINT, None)  # handler bersarang

    stop = StopRequest(clock, write)
    stop.handle(signal.SIGINT, None)
    assert stop.requested
    assert len(nested) == 1


def test_heartbeat_beats_at_start_then_periodically_and_survives_errors() -> None:
    beats: list[int] = []
    second = threading.Event()

    def beat() -> None:
        beats.append(len(beats))
        if len(beats) == 2:
            second.set()
            raise RuntimeError("database is locked")

    heartbeat = Heartbeat(beat, interval=0.01)
    heartbeat.start()
    assert beats == [0]  # detak pertama langsung, sebelum job pertama diklaim
    assert second.wait(timeout=2)
    # Galat detak tidak menghentikan thread.
    deadline = time.monotonic() + 2
    while len(beats) < 3 and time.monotonic() < deadline:
        time.sleep(0.01)
    heartbeat.stop()
    assert len(beats) >= 3
    stopped_at = len(beats)
    time.sleep(0.05)
    assert len(beats) == stopped_at
