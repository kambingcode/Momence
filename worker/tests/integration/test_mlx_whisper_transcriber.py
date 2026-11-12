"""Tes integrasi dengan Silero VAD & model Whisper sungguhan; ucapan uji = suara sintetis `say`.

Tes Whisper dilewati bila `say` tidak ada atau model belum diunduh (tidak mengunduh 1,6 GB sendiri).
"""

import itertools
import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np
import numpy.typing as npt
import pytest

from clipstudio_worker.modules.transcript.domain.markers import insert_pauses, mark_fillers
from clipstudio_worker.modules.transcript.domain.speech import (
    align_to_speech,
    decode_ranges,
    keep_spoken,
)
from clipstudio_worker.modules.transcript.domain.transcript import (
    build_word_tokens,
    choose_language,
    disfluency_prompt,
)
from clipstudio_worker.modules.transcript.infrastructure.mlx_whisper_transcriber import (
    DEFAULT_MODEL,
    MlxWhisperTranscriber,
    _window_starts,  # pyright: ignore[reportPrivateUsage]
)
from clipstudio_worker.modules.transcript.infrastructure.silero_voice_activity_detector import (
    SileroVoiceActivityDetector,
)
from clipstudio_worker.shared.audio import read_pcm16_mono


def _model_cached() -> bool:
    from huggingface_hub import try_to_load_from_cache

    return isinstance(try_to_load_from_cache(DEFAULT_MODEL, "config.json"), str)


needs_say = pytest.mark.skipif(shutil.which("say") is None, reason="butuh macOS `say`")
needs_model = pytest.mark.skipif(
    shutil.which("say") is None or not _model_cached(),
    reason="butuh macOS `say` dan model whisper di cache Hugging Face",
)


def make_audio(path: Path, *, silence_s: float = 0, voice: str = "", sentence: str = "") -> None:
    """WAV 16 kHz mono: `silence_s` detik hening lalu (opsional) satu kalimat ucapan."""
    path.parent.mkdir(parents=True, exist_ok=True)
    parts: list[npt.NDArray[np.float32]] = [np.zeros(round(silence_s * 16_000), np.float32)]
    if sentence:
        aiff = path.with_suffix(".aiff")
        spoken = path.with_suffix(".speech.wav")
        subprocess.run(["say", "-v", voice, "-o", str(aiff), sentence], check=True)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(aiff),
             "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(spoken)],
            check=True,
        )  # fmt: skip
        parts.append(read_pcm16_mono(spoken))
        aiff.unlink()
        spoken.unlink()
    write_wav(path, np.concatenate(parts))


def write_wav(path: Path, samples: npt.NDArray[np.float32]) -> None:
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16_000)
        wav.writeframes((samples * 32767).astype("<i2").tobytes())


def test_window_starts_spread_over_audio() -> None:
    second = 16_000
    assert _window_starts(10 * second) == [0]
    assert _window_starts(30 * second) == [0]
    assert _window_starts(45 * second) == [0, 15 * second]
    assert _window_starts(600 * second) == [0, 285 * second, 570 * second]


def test_vad_finds_no_speech_in_silence_or_noise(tmp_path: Path) -> None:
    make_audio(tmp_path / "silent.wav", silence_s=20)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-t", "20",
         "-i", "anoisesrc=r=16000:a=0.01:c=pink", "-c:a", "pcm_s16le", str(tmp_path / "noise.wav")],
        check=True,
    )  # fmt: skip
    vad = SileroVoiceActivityDetector(tmp_path)
    progress: list[float] = []
    assert vad.speech_ranges("silent.wav", progress.append) == []
    assert vad.speech_ranges("noise.wav", lambda _: None) == []
    assert progress[-1] == 1.0


@needs_say
def test_vad_locates_speech_after_long_silence(tmp_path: Path) -> None:
    make_audio(
        tmp_path / "late.wav", silence_s=12, voice="Damayanti", sentence="Sampai jumpa lagi."
    )
    [speech] = SileroVoiceActivityDetector(tmp_path).speech_ranges("late.wav", lambda _: None)
    assert 11_800 <= speech.start_ms <= 12_300


@needs_model
@pytest.mark.parametrize(
    ("voice", "sentence", "language", "expected_words"),
    [
        (
            "Damayanti",
            "Selamat pagi semuanya. Hari ini kita akan belajar cara membuat video pendek "
            "yang menarik untuk media sosial.",
            "id",
            {"selamat", "pagi", "video", "pendek"},
        ),
        (
            "Samantha",
            "Good morning everyone. Today we are going to learn how to make short videos "
            "that people actually want to watch.",
            "en",
            {"morning", "today", "short", "videos"},
        ),
    ],
)
def test_transcribes_speech_after_silence_with_word_timestamps(
    tmp_path: Path, voice: str, sentence: str, language: str, expected_words: set[str]
) -> None:
    # Hening panjang di depan = pemicu halusinasi ("Thank you.") bila ikut di-decode.
    make_audio(tmp_path / "media/p1/audio.wav", silence_s=35, voice=voice, sentence=sentence)
    audio = "media/p1/audio.wav"
    speech = SileroVoiceActivityDetector(tmp_path).speech_ranges(audio, lambda _: None)
    transcriber = MlxWhisperTranscriber(tmp_path)

    detected = choose_language(transcriber.detect_language(audio, speech))
    assert detected == language

    progress: list[float] = []
    words = transcriber.transcribe(
        audio, detected, disfluency_prompt(detected), decode_ranges(speech, None), progress.append
    )
    tokens = build_word_tokens(keep_spoken(words, speech), None)
    texts = {t.text.lower().strip(".,!?") for t in tokens}
    assert expected_words <= texts
    assert tokens[0].start_ms >= 34_000
    assert [t.start_ms for t in tokens] == sorted(t.start_ms for t in tokens)
    assert progress and progress[-1] == 1.0


@needs_model
def test_long_silence_between_sentences_is_not_decoded(tmp_path: Path) -> None:
    # Kalimat A, hening 40 dtk, kalimat B: kata B harus tetap di posisi aslinya (bukan di hening).
    make_audio(tmp_path / "a.wav", voice="Damayanti", sentence="Selamat pagi semuanya.")
    make_audio(tmp_path / "b.wav", voice="Damayanti", sentence="Sampai jumpa minggu depan.")
    first, second = (read_pcm16_mono(tmp_path / n) for n in ("a.wav", "b.wav"))
    gap = np.zeros(40 * 16_000, dtype=np.float32)
    write_wav(tmp_path / "audio.wav", np.concatenate([first, gap, second]))
    second_start_ms = (len(first) + len(gap)) * 1000 // 16_000

    speech = SileroVoiceActivityDetector(tmp_path).speech_ranges("audio.wav", lambda _: None)
    ranges = decode_ranges(speech, None)
    assert len(ranges) == 2
    progress: list[float] = []
    words = MlxWhisperTranscriber(tmp_path).transcribe(
        "audio.wav", "id", disfluency_prompt("id"), ranges, progress.append
    )
    tokens = build_word_tokens(words, None)
    texts = [t.text.lower().strip(".,") for t in tokens]
    assert texts[:3] == ["selamat", "pagi", "semuanya"]
    closing = {"sampai", "jumpa", "minggu", "depan"}
    assert closing <= set(texts)
    later = [t for t in tokens if t.text.lower().strip(".,") in closing]
    assert all(t.start_ms >= second_start_ms - 500 for t in later)
    # Tidak ada kata di tengah hening.
    assert not [t for t in tokens if 3_000 < t.start_ms < second_start_ms - 500]
    assert progress == sorted(progress)
    assert progress[-1] == 1.0


@needs_model
def test_pause_tokens_match_known_silences(tmp_path: Path) -> None:
    """Frasa TTS (hening tepi dipangkas) disambung dengan jeda yang diketahui pasti."""
    phrases = ["selamat pagi teman teman semua", "hari ini kita belajar membuat video",
               "pertama siapkan kamera yang bagus", "kedua tulis naskah yang singkat",
               "ketiga rekam di tempat yang terang", "jangan lupa periksa suara",
               "terima kasih sudah menonton"]  # fmt: skip
    gaps_ms = [500, 1000, 250, 800, 1500, 400]
    parts = [np.zeros(16_000, np.float32)]
    truth: list[tuple[int, int]] = []
    for index, phrase in enumerate(phrases):
        raw = tmp_path / f"p{index}.aiff"
        trimmed = tmp_path / f"p{index}.wav"
        subprocess.run(["say", "-v", "Damayanti", "-o", str(raw), phrase], check=True)
        edge = "silenceremove=start_periods=1:start_threshold=-45dB"
        trim_both = f"{edge},areverse,{edge},areverse"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", trim_both,
             "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(trimmed)],
            check=True,
        )  # fmt: skip
        parts.append(read_pcm16_mono(trimmed))
        if index < len(gaps_ms):
            start = sum(len(p) for p in parts) * 1000 // 16_000
            truth.append((start, start + gaps_ms[index]))
            parts.append(np.zeros(gaps_ms[index] * 16, np.float32))
    parts.append(np.zeros(16_000, np.float32))
    audio = np.concatenate(parts)
    duration_ms = len(audio) * 1000 // 16_000
    write_wav(tmp_path / "audio.wav", audio)

    speech = SileroVoiceActivityDetector(tmp_path).speech_ranges("audio.wav", lambda _: None)
    words = MlxWhisperTranscriber(tmp_path).transcribe(
        "audio.wav",
        "id",
        disfluency_prompt("id"),
        decode_ranges(speech, duration_ms),
        lambda _: None,
    )
    tokens = build_word_tokens(keep_spoken(words, speech), duration_ms)
    tokens = insert_pauses(mark_fillers(align_to_speech(tokens, speech)), speech, duration_ms)
    pauses = [(t.start_ms, t.end_ms) for t in tokens if t.type == "pause"]
    inner = [p for p in pauses if p[0] > 0 and p[1] < duration_ms]

    # Hening 1 dtk di awal & akhir menjadi jeda tepi.
    assert pauses[0][0] == 0 and abs(pauses[0][1] - 1000) <= 150
    assert pauses[-1][1] == duration_ms and abs(pauses[-1][1] - pauses[-1][0] - 1000) <= 150
    # Setiap jeda ≥ 400 ms terdeteksi dengan galat durasi ≤ 150 ms.
    for start, end in (g for g in truth if g[1] - g[0] >= 400):
        [hit] = [p for p in inner if p[0] < end and p[1] > start]
        assert abs((hit[1] - hit[0]) - (end - start)) <= 150, (start, end, hit)
    # Tidak ada jeda di tengah ucapan: setiap jeda bertumpu pada hening sisipan.
    for start, end in inner:
        assert any(start < g_end and end > g_start for g_start, g_end in truth), (start, end)
    # Urutan token tetap rapi.
    assert all(a.end_ms <= b.start_ms for a, b in itertools.pairwise(tokens))
