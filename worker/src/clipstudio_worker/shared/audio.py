import wave
from pathlib import Path

import numpy as np
import numpy.typing as npt

SAMPLE_RATE = 16_000


def read_pcm16_mono(path: Path) -> npt.NDArray[np.float32]:
    """Baca `audio.wav` hasil ingest (PCM 16-bit, 16 kHz, mono) sebagai float32 -1..1."""
    with wave.open(str(path), "rb") as wav:
        if (wav.getsampwidth(), wav.getnchannels(), wav.getframerate()) != (2, 1, SAMPLE_RATE):
            raise ValueError(f"Audio bukan PCM 16-bit 16 kHz mono: {path.name}")
        frames = wav.readframes(wav.getnframes())
    return np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
