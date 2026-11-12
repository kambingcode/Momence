from clipstudio_worker.modules.clips.application import Sentence
from clipstudio_worker.modules.clips.domain.sentences import ends_sentence, split_sentences
from clipstudio_worker.modules.transcript.application import Token, TokenType


def word(n: int, text: str, start_ms: int, end_ms: int, kind: TokenType = "word") -> Token:
    prefix = "p" if kind == "pause" else "w"
    return Token(f"{prefix}{n}", kind, text, start_ms, end_ms)


def test_ends_sentence_on_terminal_punctuation_with_closing_marks() -> None:
    assert ends_sentence("selesai.")
    assert ends_sentence('Ayo!"')
    assert ends_sentence("benar?)")
    assert ends_sentence("jadi…")
    assert not ends_sentence("halo,")
    assert not ends_sentence("3.5")
    assert not ends_sentence("")


def test_groups_words_and_fillers_into_sentences_and_skips_pauses() -> None:
    tokens = [
        word(1, "Eh,", 0, 200, "filler"),
        word(2, "halo", 300, 600),
        word(3, "semua.", 600, 1000),
        word(1, "", 1000, 1500, "pause"),
        word(4, "Apa", 1500, 1800),
        word(5, "kabar?", 1800, 2200),
    ]
    assert split_sentences(tokens) == [
        Sentence(1, "Eh, halo semua.", 0, 1000, "w1", "w3"),
        Sentence(2, "Apa kabar?", 1500, 2200, "w4", "w5"),
    ]


def test_long_pause_breaks_sentence_without_punctuation() -> None:
    tokens = [
        word(1, "jadi", 0, 400),
        word(1, "", 400, 1900, "pause"),
        word(2, "lanjut", 1900, 2300),
    ]
    assert [(s.text, s.first_token_id) for s in split_sentences(tokens)] == [
        ("jadi", "w1"),
        ("lanjut", "w2"),
    ]


def test_short_pause_keeps_sentence_together() -> None:
    tokens = [
        word(1, "jadi", 0, 400),
        word(1, "", 400, 1000, "pause"),
        word(2, "gitu.", 1000, 1400),
    ]
    assert [s.text for s in split_sentences(tokens)] == ["jadi gitu."]


def test_unpunctuated_speech_is_split_at_thirty_seconds() -> None:
    tokens = [word(n, f"kata{n}", n * 1000, n * 1000 + 900) for n in range(45)]
    sentences = split_sentences(tokens)
    assert [(s.first_token_id, s.last_token_id) for s in sentences] == [
        ("w0", "w29"),
        ("w30", "w44"),
    ]
    assert all(s.duration_ms <= 30_000 for s in sentences)


def test_empty_transcript_has_no_sentences() -> None:
    assert split_sentences([]) == []
    assert split_sentences([word(1, "", 0, 5000, "pause")]) == []
