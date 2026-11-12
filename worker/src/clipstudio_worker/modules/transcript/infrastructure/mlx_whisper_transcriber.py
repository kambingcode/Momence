"""Adapter mlx-whisper (Whisper di GPU Apple). Model dimuat sekali lalu dipakai ulang antar-job."""

import importlib
import math
from collections.abc import Generator, Mapping, Sequence
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import numpy as np
import numpy.typing as npt

from clipstudio_worker.modules.transcript.application import (
    Language,
    RecognizedWord,
    StepProgress,
    TimeRange,
    Transcriber,
)
from clipstudio_worker.shared.audio import SAMPLE_RATE, read_pcm16_mono
from clipstudio_worker.shared.paths import resolve_data_path

DEFAULT_MODEL = "mlx-community/whisper-large-v3-turbo"
_WINDOW_SAMPLES = 30 * SAMPLE_RATE
# Deteksi bahasa dari beberapa jendela 30 dtk yang tersebar di sepanjang ucapan.
_LANGUAGE_WINDOWS = 3
# Kata terakhir rentang sebelumnya yang diteruskan sebagai konteks prompt.
_CONTEXT_WORDS = 30


def _module(name: str) -> Any:
    # mlx_whisper tidak punya anotasi tipe; diimpor saat dipakai agar `worker --help` tetap cepat.
    return importlib.import_module(name)


class MlxWhisperTranscriber(Transcriber):
    def __init__(self, data_dir: Path, model: str = DEFAULT_MODEL) -> None:
        self._data_dir = data_dir
        self._model = model

    def detect_language(self, audio_path: str, speech: Sequence[TimeRange]) -> Mapping[str, float]:
        mx = _module("mlx.core")
        whisper_audio = _module("mlx_whisper.audio")

        model = self._load_model()
        samples = self._load_audio(audio_path)
        # Hanya bagian ucapan, disambung: intro musik/hening tidak ikut menentukan bahasa.
        voiced = np.concatenate(
            [samples[_to_sample(r.start_ms) : _to_sample(r.end_ms)] for r in speech] or [samples]
        )
        starts = _window_starts(len(voiced))
        totals: dict[str, float] = {}
        for start in starts:
            mel = whisper_audio.log_mel_spectrogram(
                # pad_or_trim mlx hanya bisa mem-pad mx.array (bukan numpy).
                whisper_audio.pad_or_trim(mx.array(voiced[start : start + _WINDOW_SAMPLES])),
                n_mels=model.dims.n_mels,
            )
            mel = whisper_audio.pad_or_trim(mel, whisper_audio.N_FRAMES, axis=-2)
            _, probabilities = model.detect_language(mel.astype(mx.float16))
            for code, probability in probabilities.items():
                totals[code] = totals.get(code, 0.0) + float(probability)
        return {code: total / len(starts) for code, total in totals.items()}

    def transcribe(
        self,
        audio_path: str,
        language: Language,
        initial_prompt: str,
        ranges: Sequence[TimeRange],
        on_progress: StepProgress,
    ) -> list[RecognizedWord]:
        samples = self._load_audio(audio_path)
        total_ms = sum(r.end_ms - r.start_ms for r in ranges)
        words: list[RecognizedWord] = []
        done_ms = 0
        context = ""
        # Satu panggilan per rentang, BUKAN `clip_timestamps`: mlx-whisper 0.4.3 tidak melompat
        # ke awal klip ke-2 dst., sehingga ucapan setelah hening panjang bisa hilang.
        for item in ranges:
            span_ms = item.end_ms - item.start_ms
            with _report_progress(_scaled(on_progress, done_ms, span_ms, total_ms)):
                result = _module("mlx_whisper").transcribe(
                    samples[_to_sample(item.start_ms) : _to_sample(item.end_ms)],
                    path_or_hf_repo=self._model,
                    language=language,
                    # Gaya disfluensi + ekor rentang sebelumnya agar ejaan/nama tetap konsisten.
                    initial_prompt=f"{initial_prompt} {context}".strip(),
                    word_timestamps=True,
                    # verbose=False menyalakan progress bar (tqdm) yang disadap.
                    verbose=False,
                    # Lewati hening panjang sebelum teks yang kemungkinan halusinasi.
                    hallucination_silence_threshold=2.0,
                )
            offset = item.start_ms / 1000
            found = [
                RecognizedWord(
                    text=str(word["word"]),
                    start=float(word["start"]) + offset,
                    end=float(word["end"]) + offset,
                    probability=float(word["probability"]) if "probability" in word else None,
                )
                for segment in result.get("segments", [])
                for word in segment.get("words", [])
            ]
            words.extend(found)
            if found:
                context = " ".join(w.text.strip() for w in found[-_CONTEXT_WORDS:])
            done_ms += span_ms
        on_progress(1.0)
        return words

    def _load_model(self) -> Any:
        # Cache yang sama dengan mlx_whisper.transcribe, jadi model tidak dimuat dua kali.
        holder = _module("mlx_whisper.transcribe").ModelHolder
        return holder.get_model(self._model, _module("mlx.core").float16)

    def _load_audio(self, audio_path: str) -> npt.NDArray[np.float32]:
        return read_pcm16_mono(resolve_data_path(self._data_dir, audio_path))


def _to_sample(ms: int) -> int:
    return ms * SAMPLE_RATE // 1000


def _scaled(on_progress: StepProgress, done_ms: int, span_ms: int, total_ms: int) -> StepProgress:
    """Progres satu rentang (0–1) → progres keseluruhan, berbobot durasi rentang."""

    def report(fraction: float) -> None:
        on_progress((done_ms + fraction * span_ms) / total_ms)

    return report


def _window_starts(total_samples: int) -> list[int]:
    """Awal jendela 30 dtk (dalam sampel), tersebar merata dari awal sampai akhir audio."""
    if total_samples <= _WINDOW_SAMPLES:
        return [0]
    count = min(_LANGUAGE_WINDOWS, math.ceil(total_samples / _WINDOW_SAMPLES))
    last = total_samples - _WINDOW_SAMPLES
    return [round(i * last / (count - 1)) for i in range(count)]


class _ProgressBar:
    """Pengganti tqdm.tqdm: meneruskan jumlah frame yang selesai sebagai pecahan 0–1."""

    def __init__(self, on_progress: StepProgress, total: int | None = None, **_: object) -> None:
        self._on_progress = on_progress
        self._total = total or 0
        self._done = 0

    def __enter__(self) -> "_ProgressBar":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def update(self, n: int = 1) -> None:
        self._done += n
        if self._total > 0:
            self._on_progress(min(1.0, self._done / self._total))


@contextmanager
def _report_progress(on_progress: StepProgress) -> Generator[None]:
    # mlx_whisper hanya melaporkan progres lewat `tqdm.tqdm(...)` di modul transcribe-nya.
    # Worker menjalankan satu job sekaligus, jadi penggantian sementara ini aman.
    module = _module("mlx_whisper.transcribe")
    original = module.tqdm

    def make_bar(total: int | None = None, **_: object) -> _ProgressBar:
        return _ProgressBar(on_progress, total)

    module.tqdm = SimpleNamespace(tqdm=make_bar)
    try:
        yield
    finally:
        module.tqdm = original
