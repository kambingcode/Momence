"""Aturan murni penanda transkrip: kata pengisi (filler) dan token jeda (pause)."""

import re
from collections.abc import Iterable, Sequence
from dataclasses import replace

from clipstudio_worker.modules.transcript.domain.speech import TimeRange, silent_parts
from clipstudio_worker.modules.transcript.domain.transcript import Token

# Bentuk ternormalisasi (lihat `filler_key`): "ummm" → "um", "hmmm" → "hm", "Eeh," → "eh".
# ID: eh, em, ehm, e, m, anu · EN: um, uh, uhm, hm, mhm, ah, er, erm.
DEFAULT_FILLER_WORDS: frozenset[str] = frozenset(
    {"eh", "em", "ehm", "e", "m", "anu", "um", "uh", "uhm", "hm", "mhm", "ah", "er", "erm"}
)
# Celah antar-kata minimal yang dijadikan token jeda.
MIN_PAUSE_MS = 300

_REPEATED_LETTER = re.compile(r"(.)\1+")


def filler_key(text: str) -> str:
    """Huruf kecil, hanya huruf, huruf berulang diringkas: "Ummm," → "um", "Mm-hmm" → "mhm"."""
    letters = "".join(ch for ch in text.lower() if ch.isalpha())
    return _REPEATED_LETTER.sub(r"\1", letters)


def mark_fillers(
    tokens: Sequence[Token], fillers: Iterable[str] = DEFAULT_FILLER_WORDS
) -> list[Token]:
    """Token kata yang cocok dengan daftar filler diberi `type="filler"` (id & waktu tetap).

    Entri tanpa huruf diabaikan: kuncinya kosong dan akan cocok dengan angka/tanda baca.
    """
    keys = {filler_key(word) for word in fillers} - {""}
    return [
        replace(token, type="filler")
        if token.type == "word" and filler_key(token.text) in keys
        else token
        for token in tokens
    ]


def insert_pauses(
    tokens: Sequence[Token],
    speech: Sequence[TimeRange],
    duration_ms: int | None,
    min_pause_ms: int = MIN_PAUSE_MS,
) -> list[Token]:
    """Sisipkan token `pause` (`p1`, `p2`, …) pada HENING ≥ `min_pause_ms` di celah antar-token:
    sebelum kata pertama, di antara kata, dan setelah kata terakhir sampai akhir audio.

    Hening = celah dikurangi rentang ucapan VAD, jadi jeda tidak pernah berisi suara (celah
    timestamp Whisper di tengah ucapan, atau batuk/tawa yang tidak tertranskripsi, bukan jeda).
    Tanpa kata → tanpa jeda.
    """
    ranges = sorted(speech, key=lambda r: r.start_ms)
    starts = [r.start_ms for r in ranges]
    result: list[Token] = []
    cursor = 0
    pauses = 0

    def add_pauses(start_ms: int, end_ms: int) -> None:
        nonlocal pauses
        for part in silent_parts(start_ms, end_ms, ranges, starts):
            if part.end_ms - part.start_ms >= min_pause_ms:
                pauses += 1
                result.append(
                    Token(
                        id=f"p{pauses}",
                        type="pause",
                        text="",
                        start_ms=part.start_ms,
                        end_ms=part.end_ms,
                    )
                )

    for token in tokens:
        add_pauses(cursor, token.start_ms)
        result.append(token)
        cursor = max(cursor, token.end_ms)
    if tokens and duration_ms:
        add_pauses(cursor, duration_ms)
    return result
