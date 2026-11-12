"""Kalimat dari token transkrip: satuan batas klip (klip mulai & berakhir di tepi kalimat)."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Protocol

_SENTENCE_END = (".", "!", "?", "…")
# Penutup yang boleh mengikuti tanda akhir kalimat ('"Ayo!"', "(selesai.)").
_CLOSING = "\"'”’)]»"
# Hening sepanjang ini memutus kalimat walau Whisper tidak menulis tanda baca.
SENTENCE_BREAK_PAUSE_MS = 1500
# Ucapan tanpa tanda baca lebih panjang dari ini dipotong paksa agar klip tetap punya batas.
MAX_SENTENCE_MS = 30_000


class TranscriptToken(Protocol):
    """Bentuk token transkrip yang dibutuhkan (dipenuhi `Token` modul transcript)."""

    @property
    def id(self) -> str: ...
    @property
    def type(self) -> str: ...
    @property
    def text(self) -> str: ...
    @property
    def start_ms(self) -> int: ...
    @property
    def end_ms(self) -> int: ...


@dataclass(frozen=True)
class Sentence:
    # Nomor urut di seluruh transkrip (mulai 1); dipakai Gemini untuk menunjuk batas klip.
    number: int
    text: str
    start_ms: int
    end_ms: int
    first_token_id: str
    last_token_id: str

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms


def ends_sentence(text: str) -> bool:
    return text.rstrip().rstrip(_CLOSING).endswith(_SENTENCE_END)


def split_sentences(tokens: Iterable[TranscriptToken]) -> list[Sentence]:
    """Kata & filler dikelompokkan per kalimat; jeda tidak ikut, tetapi jeda panjang memutus."""
    sentences: list[Sentence] = []
    current: list[TranscriptToken] = []

    def flush() -> None:
        if current:
            sentences.append(_sentence(len(sentences) + 1, current))
            current.clear()

    for token in tokens:
        if token.type == "pause":
            if token.end_ms - token.start_ms >= SENTENCE_BREAK_PAUSE_MS:
                flush()
            continue
        if current and token.end_ms - current[0].start_ms > MAX_SENTENCE_MS:
            flush()
        current.append(token)
        if ends_sentence(token.text):
            flush()
    flush()
    return sentences


def _sentence(number: int, tokens: Sequence[TranscriptToken]) -> Sentence:
    return Sentence(
        number=number,
        text=" ".join(t.text.strip() for t in tokens if t.text.strip()),
        start_ms=tokens[0].start_ms,
        end_ms=tokens[-1].end_ms,
        first_token_id=tokens[0].id,
        last_token_id=tokens[-1].id,
    )
