"""Port modul transcript. Path audio = relatif terhadap direktori data, format POSIX."""

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol

from clipstudio_worker.modules.transcript.domain.speech import TimeRange
from clipstudio_worker.modules.transcript.domain.transcript import (
    Language,
    RecognizedWord,
    Token,
)

# Menerima pecahan 0.0–1.0 dari langkah yang sedang berjalan.
StepProgress = Callable[[float], None]


@dataclass(frozen=True)
class Transcript:
    project_id: str
    source_id: str
    # None bila audio tidak berisi ucapan.
    language: Language | None
    tokens: Sequence[Token]


class VoiceActivityDetector(Protocol):
    def speech_ranges(self, audio_path: str, on_progress: StepProgress) -> list[TimeRange]:
        """Rentang berisi ucapan, berurutan & tidak tumpang-tindih."""
        ...


class Transcriber(Protocol):
    def detect_language(self, audio_path: str, speech: Sequence[TimeRange]) -> Mapping[str, float]:
        """Peluang tiap kode bahasa Whisper (mis. {'id': 0.7, 'ms': 0.2}) dari bagian ucapan."""
        ...

    def transcribe(
        self,
        audio_path: str,
        language: Language,
        initial_prompt: str,
        ranges: Sequence[TimeRange],
        on_progress: StepProgress,
    ) -> list[RecognizedWord]:
        """Kata berurutan dengan timestamp per kata; hanya `ranges` yang di-decode."""
        ...


class TranscriptRepository(Protocol):
    def save(self, transcript: Transcript) -> str:
        """Simpan/timpa transkrip milik `source_id`; mengembalikan id transkrip."""
        ...

    def get_by_source(self, source_id: str) -> Transcript | None: ...


class AudioUnavailableError(Exception):
    """Audio tidak ada dan tidak bisa dibuat ulang; pesannya untuk pengguna."""


class AudioCache(Protocol):
    """`audio.wav` hanya dibutuhkan selama transkripsi; setelah itu dihapus agar hemat ruang."""

    def ensure(self, source_path: str, audio_path: str, duration_ms: int) -> None:
        """Buat ulang audio dari video sumber bila file belum ada (mis. job diulang setelah
        audionya dihapus). Melempar `AudioUnavailableError` bila videonya pun belum ada (mis. masih
        diunduh)."""
        ...

    def discard(self, audio_path: str) -> None:
        """Hapus audio; file yang tidak ada diabaikan, galat hanya dicatat."""
        ...
