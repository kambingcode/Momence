"""Aturan murni transkrip: pilihan bahasa, prompt disfluensi, dan token kata dari keluaran ASR."""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

Language = Literal["id", "en"]
SUPPORTED_LANGUAGES: tuple[Language, ...] = ("id", "en")
# Whisper sering mengira bahasa Indonesia sebagai Melayu; peluangnya dihitung sebagai `id`.
_LANGUAGE_ALIASES: dict[str, Language] = {"id": "id", "ms": "id", "en": "en"}

# Contoh ucapan penuh disfluensi: Whisper meniru gaya prompt, jadi filler tidak dibuang.
_DISFLUENCY_PROMPTS: dict[Language, str] = {
    "id": "Eh, jadi... em, gimana ya, anu, hmm, ya gitu. Terus, eh, kita, em, mulai aja.",
    "en": "Umm, so, uh, I mean, like, you know... hmm, okay. Uh, let's, um, just start.",
}

TokenType = Literal["word", "filler", "pause"]

# Whisper menempelkan "-" ke kata BERIKUTNYA ("sehari" + "-hari"); potongan yang menempel
# (celah ≤ ini) digabung kembali agar reduplikasi tetap satu kata ("sehari-hari").
_HYPHEN_JOIN_MAX_GAP_MS = 100
_SENTENCE_END = (".", ",", "!", "?", ":", ";")

# Halusinasi pengulangan: panjang salinan (kata) yang dicek & rasio durasi salinan/aslinya.
_REPEAT_MIN_WORDS = 3
_REPEAT_MAX_WORDS = 60
_REPEAT_MAX_RATIO = 0.3


@dataclass(frozen=True)
class RecognizedWord:
    """Kata mentah dari ASR (waktu dalam detik, teks bisa diawali spasi)."""

    text: str
    start: float
    end: float
    probability: float | None = None


@dataclass(frozen=True)
class Token:
    id: str
    type: TokenType
    text: str
    start_ms: int
    end_ms: int
    confidence: float | None = None


def choose_language(probabilities: Mapping[str, float]) -> Language:
    """Bahasa yang didukung dengan peluang terbesar; seri atau tanpa data → `id`."""
    scores = dict.fromkeys(SUPPORTED_LANGUAGES, 0.0)
    for code, probability in probabilities.items():
        language = _LANGUAGE_ALIASES.get(code)
        if language is not None:
            scores[language] += probability
    return max(SUPPORTED_LANGUAGES, key=lambda language: scores[language])


def disfluency_prompt(language: Language) -> str:
    return _DISFLUENCY_PROMPTS[language]


def build_word_tokens(words: Iterable[RecognizedWord], duration_ms: int | None) -> list[Token]:
    """Bersihkan kata ASR jadi token berurutan: teks dipangkas, kata kosong dibuang,
    waktu dibulatkan ke ms & dijepit ke durasi audio, tanpa tumpang-tindih, dan potongan
    reduplikasi ("-hari") digabung ke kata sebelumnya.

    Id = urutan kata (`w1`, `w2`, …), jadi transkripsi ulang yang sama menghasilkan id yang sama.
    """
    tokens: list[Token] = []
    previous_end = 0
    for word in words:
        text = word.text.strip()
        if not text:
            continue
        start_ms = _clamp(round(word.start * 1000), duration_ms)
        end_ms = _clamp(round(word.end * 1000), duration_ms)
        start_ms = max(start_ms, previous_end)
        end_ms = max(end_ms, start_ms)
        confidence = None if word.probability is None else round(word.probability, 3)
        if tokens and _continues_previous(text, tokens[-1], start_ms):
            previous = tokens[-1]
            tokens[-1] = Token(
                id=previous.id,
                type=previous.type,
                text=previous.text + text,
                start_ms=previous.start_ms,
                end_ms=end_ms,
                confidence=_min_confidence(previous.confidence, confidence),
            )
            previous_end = end_ms
            continue
        tokens.append(
            Token(
                id=f"w{len(tokens) + 1}",
                type="word",
                text=text,
                start_ms=start_ms,
                end_ms=end_ms,
                confidence=confidence,
            )
        )
        previous_end = end_ms
    return tokens


def drop_compressed_repeats(
    words: Sequence[RecognizedWord],
    min_words: int = _REPEAT_MIN_WORDS,
    max_ratio: float = _REPEAT_MAX_RATIO,
) -> list[RecognizedWord]:
    """Buang halusinasi "ulang kalimat sebelumnya": ≥ `min_words` kata yang persis mengulang
    kata-kata tepat sebelumnya tetapi dimampatkan (durasi ≤ `max_ratio` × aslinya; Whisper
    menaruhnya di ujung klip dengan durasi ±0). Pengulangan sungguhan berdurasi normal."""
    texts = [_norm(w.text) for w in words]
    result: list[RecognizedWord] = []
    result_texts: list[str] = []
    index = 0
    while index < len(words):
        longest = min(len(result), len(words) - index, _REPEAT_MAX_WORDS)
        for size in range(longest, min_words - 1, -1):
            if texts[index : index + size] == result_texts[-size:] and (
                _span(words[index : index + size]) <= max_ratio * _span(result[-size:])
            ):
                index += size
                break
        else:
            result.append(words[index])
            result_texts.append(texts[index])
            index += 1
    return result


def _norm(text: str) -> str:
    return "".join(ch for ch in text.lower() if ch.isalnum())


def _span(words: Sequence[RecognizedWord]) -> float:
    return words[-1].end - words[0].start


def _continues_previous(text: str, previous: Token, start_ms: int) -> bool:
    return (
        len(text) > 1
        and text.startswith("-")
        and not previous.text.endswith(_SENTENCE_END)
        and start_ms - previous.end_ms <= _HYPHEN_JOIN_MAX_GAP_MS
    )


def _min_confidence(a: float | None, b: float | None) -> float | None:
    if a is None or b is None:
        return a if b is None else b
    return min(a, b)


def _clamp(value_ms: int, duration_ms: int | None) -> int:
    value_ms = max(0, value_ms)
    return min(value_ms, duration_ms) if duration_ms else value_ms
