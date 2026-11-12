"""Aturan murni rentang ucapan (hasil VAD): apa yang dikirim ke ASR & kata mana yang dipercaya."""

import bisect
import itertools
from collections.abc import Sequence
from dataclasses import dataclass, replace

from clipstudio_worker.modules.transcript.domain.transcript import RecognizedWord, Token

# Padding & penggabungan rentang yang di-decode: konteks kalimat tetap utuh, hening panjang
# (sumber halusinasi seperti "Thank you." / "Terima kasih.") tidak pernah sampai ke Whisper.
DECODE_PADDING_MS = 200
DECODE_MERGE_GAP_MS = 2000
# Timestamp kata Whisper bisa meleset beberapa ratus ms dari tepi ucapan.
SPOKEN_TOLERANCE_MS = 300
# Kata yang setelah dipangkas tersisa lebih pendek dari ini dibiarkan apa adanya
# (kemungkinan timestamp Whisper yang meleset, bukan kata yang menutupi jeda).
ALIGN_MIN_WORD_MS = 80


@dataclass(frozen=True)
class TimeRange:
    start_ms: int
    end_ms: int


def decode_ranges(
    speech: Sequence[TimeRange],
    duration_ms: int | None,
    padding_ms: int = DECODE_PADDING_MS,
    merge_gap_ms: int = DECODE_MERGE_GAP_MS,
) -> list[TimeRange]:
    """Rentang ucapan diberi padding, dijepit ke durasi, lalu digabung bila celahnya pendek."""
    merged: list[TimeRange] = []
    for item in sorted(speech, key=lambda r: r.start_ms):
        start = max(0, item.start_ms - padding_ms)
        end = item.end_ms + padding_ms
        if duration_ms:
            end = min(end, duration_ms)
        if end <= start:
            continue
        if merged and start - merged[-1].end_ms <= merge_gap_ms:
            previous = merged[-1]
            merged[-1] = TimeRange(previous.start_ms, max(previous.end_ms, end))
        else:
            merged.append(TimeRange(start, end))
    return merged


def keep_spoken(
    words: Sequence[RecognizedWord],
    speech: Sequence[TimeRange],
    tolerance_ms: int = SPOKEN_TOLERANCE_MS,
) -> list[RecognizedWord]:
    """Buang kata yang sama sekali tidak bersinggungan dengan ucapan (± toleransi)."""
    ranges = sorted(speech, key=lambda r: r.start_ms)
    starts = [r.start_ms for r in ranges]

    def spoken(word: RecognizedWord) -> bool:
        start_ms, end_ms = word.start * 1000, word.end * 1000
        # Rentang terakhir yang mulai sebelum kata berakhir (+ toleransi) adalah satu-satunya
        # kandidat yang perlu dicek, karena rentang VAD tidak saling tumpang-tindih.
        index = bisect.bisect_right(starts, end_ms + tolerance_ms) - 1
        return index >= 0 and ranges[index].end_ms + tolerance_ms >= start_ms

    return [word for word in words if spoken(word)]


def silent_parts(
    start_ms: int,
    end_ms: int,
    speech: Sequence[TimeRange],
    starts: Sequence[int] | None = None,
) -> list[TimeRange]:
    """Bagian [start_ms, end_ms) yang tidak tertutup rentang ucapan.

    `speech` harus berurutan; `starts` = awal tiap rentang (berikan bila memanggil berulang
    pada `speech` yang sama agar tidak dihitung ulang).
    """
    if starts is None:
        starts = [r.start_ms for r in speech]
    parts: list[TimeRange] = []
    cursor = start_ms
    first = max(0, bisect.bisect_right(starts, start_ms) - 1)
    for item in itertools.islice(speech, first, None):
        if item.start_ms >= end_ms:
            break
        if item.end_ms <= cursor:
            continue
        if item.start_ms > cursor:
            parts.append(TimeRange(cursor, item.start_ms))
        cursor = max(cursor, item.end_ms)
    if cursor < end_ms:
        parts.append(TimeRange(cursor, end_ms))
    return parts


def align_to_speech(
    tokens: Sequence[Token], speech: Sequence[TimeRange], min_word_ms: int = ALIGN_MIN_WORD_MS
) -> list[Token]:
    """Selaraskan tepi kata dengan rentang ucapan VAD.

    - Tepi kata yang jatuh di hening dipangkas ke tepi ucapan (Whisper sering memanjangkan kata
      sampai menutupi jeda).
    - Kata pertama/terakhir dalam satu rentang ucapan diperpanjang ke tepi rentang itu (Whisper
      kadang mengakhiri kata terlalu cepat).

    Hasilnya celah antar-rentang (hening nyata) menjadi jeda utuh dan jeda tidak berisi ucapan,
    jadi memotong jeda tidak memotong suara. Hening di TENGAH kata tidak diubah.
    """
    ranges = sorted(speech, key=lambda r: r.start_ms)
    starts = [r.start_ms for r in ranges]

    # Indeks rentang pertama & terakhir yang bersinggungan dengan tiap kata (None = tidak selaras).
    spans: list[tuple[int, int] | None] = []
    trimmed: list[Token] = []
    for token in tokens:
        first = max(0, bisect.bisect_right(starts, token.start_ms) - 1)
        if first < len(ranges) and ranges[first].end_ms <= token.start_ms:
            first += 1
        last = bisect.bisect_left(starts, token.end_ms) - 1
        start_ms = max(token.start_ms, ranges[first].start_ms) if first <= last else 0
        end_ms = min(token.end_ms, ranges[last].end_ms) if first <= last else 0
        if first > last or end_ms - start_ms < min(min_word_ms, token.end_ms - token.start_ms):
            # Kata yang sisa ucapannya terlalu pendek kemungkinan timestamp yang meleset.
            spans.append(None)
            trimmed.append(token)
        else:
            spans.append((first, last))
            trimmed.append(replace(token, start_ms=start_ms, end_ms=end_ms))

    # Kata selaras terdekat sebelum/sesudah: menentukan kata pertama/terakhir di tiap rentang.
    aligned = [(i, span) for i, span in enumerate(spans) if span is not None]
    previous_last: dict[int, int] = {}
    next_first: dict[int, int] = {}
    for (before, before_span), (after, after_span) in itertools.pairwise(aligned):
        next_first[before] = after_span[0]
        previous_last[after] = before_span[1]

    result: list[Token] = []
    for index, token in enumerate(trimmed):
        span = spans[index]
        if span is not None:
            first, last = span
            start_ms, end_ms = token.start_ms, token.end_ms
            if previous_last.get(index, -1) < first:
                start_ms = ranges[first].start_ms
            if next_first.get(index, len(ranges)) > last:
                end_ms = ranges[last].end_ms
            token = replace(token, start_ms=start_ms, end_ms=end_ms)
        if result and token.start_ms < result[-1].end_ms:
            # Tetap berurutan tanpa tumpang-tindih bila kata tak selaras bertemu kata selaras.
            boundary = result[-1].end_ms
            token = replace(token, start_ms=boundary, end_ms=max(token.end_ms, boundary))
        result.append(token)
    return result
