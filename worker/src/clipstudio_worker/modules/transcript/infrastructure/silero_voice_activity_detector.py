"""Adapter Silero VAD (CPU, model ikut dalam paket `silero-vad`; tanpa unduhan)."""

import importlib
import warnings
from pathlib import Path
from typing import Any

from clipstudio_worker.modules.transcript.application import (
    StepProgress,
    TimeRange,
    VoiceActivityDetector,
)
from clipstudio_worker.shared.audio import SAMPLE_RATE, read_pcm16_mono
from clipstudio_worker.shared.paths import resolve_data_path

# Tanpa padding: rentang = pengukuran ucapan seakurat mungkin (diukur pada jeda sisipan yang
# diketahui: awal ucapan 0–55 ms terlambat, akhir 0–70 ms terlambat → jeda ±15 ms lebih pendek).
# Padding bawaan silero (30 ms tiap sisi) membuat jeda ±90 ms terlalu pendek sehingga hening
# 300–400 ms tidak terdeteksi. Margin agar potongan tidak memangkas suara diterapkan saat
# memotong (editor/render), bukan di sini.
_SPEECH_PAD_MS = 0


def _module(name: str) -> Any:
    # silero_vad tidak punya anotasi tipe; diimpor saat dipakai agar `worker --help` tetap cepat.
    return importlib.import_module(name)


class SileroVoiceActivityDetector(VoiceActivityDetector):
    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir
        self._model: Any = None

    def speech_ranges(self, audio_path: str, on_progress: StepProgress) -> list[TimeRange]:
        torch = _module("torch")
        samples = read_pcm16_mono(resolve_data_path(self._data_dir, audio_path))
        if samples.size == 0:
            return []

        def track(percent: float) -> None:
            on_progress(percent / 100)

        timestamps = _module("silero_vad").get_speech_timestamps(
            torch.from_numpy(samples),
            self._load_model(),
            sampling_rate=SAMPLE_RATE,
            speech_pad_ms=_SPEECH_PAD_MS,
            # Callback menerima persen 0–100.
            progress_tracking_callback=track,
        )
        on_progress(1.0)
        return [
            TimeRange(
                start_ms=int(item["start"]) * 1000 // SAMPLE_RATE,
                end_ms=int(item["end"]) * 1000 // SAMPLE_RATE,
            )
            for item in timestamps
        ]

    def _load_model(self) -> Any:
        if self._model is None:
            with warnings.catch_warnings():
                # silero-vad memakai torch.jit.load yang ditandai deprecated oleh torch terbaru.
                warnings.simplefilter("ignore", FutureWarning)
                self._model = _module("silero_vad").load_silero_vad()
        return self._model
