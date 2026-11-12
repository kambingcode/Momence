from collections.abc import Mapping, Sequence

import pytest

from clipstudio_worker.modules.jobs.application import Job, JobFailure
from clipstudio_worker.modules.projects.application import (
    MediaInfo,
    SourceRecord,
    SourceRepository,
)
from clipstudio_worker.modules.transcript.application import (
    AudioUnavailableError,
    Language,
    RecognizedWord,
    StepProgress,
    TimeRange,
    TranscribeJob,
    Transcriber,
    Transcript,
    TranscriptRepository,
    VoiceActivityDetector,
)
from tests.modules.jobs.fakes import InMemoryJobRepository


class FakeSources(SourceRepository):
    def __init__(self, *records: SourceRecord) -> None:
        self.records = {r.id: r for r in records}

    def get(self, source_id: str) -> SourceRecord | None:
        return self.records.get(source_id)

    def save_audio(
        self, source_id: str, duration_ms: int, audio_path: str, project_name: str | None
    ) -> None:
        raise AssertionError("transcribe tidak boleh mengubah sumber")

    def save_media(self, source_id: str, info: MediaInfo, audio_path: str, proxy_path: str) -> None:
        raise AssertionError("transcribe tidak boleh mengubah metadata sumber")

    def save_download(self, source_id: str, size_bytes: int, project_name: str) -> None:
        raise AssertionError("transcribe tidak boleh mengubah sumber")


class FakeTranscripts(TranscriptRepository):
    def __init__(self) -> None:
        self.saved: dict[str, Transcript] = {}

    def save(self, transcript: Transcript) -> str:
        self.saved[transcript.source_id] = transcript
        return f"t-{transcript.source_id}"

    def get_by_source(self, source_id: str) -> Transcript | None:
        return self.saved.get(source_id)


class FakeVad(VoiceActivityDetector):
    def __init__(self, speech: list[TimeRange]) -> None:
        self.speech = speech

    def speech_ranges(self, audio_path: str, on_progress: StepProgress) -> list[TimeRange]:
        on_progress(0.5)
        return self.speech


class FakeTranscriber(Transcriber):
    def __init__(self, probabilities: Mapping[str, float], words: list[RecognizedWord]) -> None:
        self.probabilities = probabilities
        self.words = words
        self.detect_calls: list[tuple[str, Sequence[TimeRange]]] = []
        self.transcribe_calls: list[tuple[str, Language, str, Sequence[TimeRange]]] = []

    def detect_language(self, audio_path: str, speech: Sequence[TimeRange]) -> Mapping[str, float]:
        self.detect_calls.append((audio_path, speech))
        return self.probabilities

    def transcribe(
        self,
        audio_path: str,
        language: Language,
        initial_prompt: str,
        ranges: Sequence[TimeRange],
        on_progress: StepProgress,
    ) -> list[RecognizedWord]:
        self.transcribe_calls.append((audio_path, language, initial_prompt, ranges))
        on_progress(0.5)
        on_progress(1.0)
        return self.words


READY = SourceRecord(
    id="s1",
    project_id="p1",
    path="media/p1/source.mp4",
    audio_path="media/p1/audio.wav",
    duration_ms=10_000,
)
SPEECH = [TimeRange(100, 2000), TimeRange(3000, 4000), TimeRange(8000, 9900)]
WORDS = [
    RecognizedWord(" Eh,", 0.1, 0.3, 0.9),
    RecognizedWord(" halo", 0.5, 1.8, 0.8),
    # Jatuh di hening 4,3–7,7 dtk: halusinasi, dibuang.
    RecognizedWord(" Terima", 5.0, 5.4, 0.4),
    RecognizedWord(" kasih.", 5.4, 5.9, 0.4),
    RecognizedWord(" semua.", 8.1, 10.4, 0.9),
]


def job(payload: object) -> Job:
    return Job(
        id="j1",
        project_id="p1",
        type="transcribe",
        status="running",
        progress=0,
        payload=payload,
        attempts=1,
    )


def run(
    transcriber: FakeTranscriber,
    speech: list[TimeRange] = SPEECH,
    source: SourceRecord = READY,
    transcripts: FakeTranscripts | None = None,
    progress: list[float] | None = None,
    jobs: InMemoryJobRepository | None = None,
) -> Mapping[str, object]:
    use_case = TranscribeJob(
        FakeSources(source),
        transcripts or FakeTranscripts(),
        FakeVad(speech),
        transcriber,
        jobs or InMemoryJobRepository(),
    )
    return use_case(job({"sourceId": source.id}), (progress if progress is not None else []).append)


def test_transcribes_speech_in_detected_language_and_drops_hallucinations() -> None:
    transcripts = FakeTranscripts()
    transcriber = FakeTranscriber({"ms": 0.5, "id": 0.2, "en": 0.3}, WORDS)
    progress: list[float] = []
    jobs = InMemoryJobRepository()

    result = run(transcriber, transcripts=transcripts, progress=progress, jobs=jobs)

    assert transcriber.detect_calls == [("media/p1/audio.wav", SPEECH)]
    [(audio, language, prompt, ranges)] = transcriber.transcribe_calls
    assert (audio, language) == ("media/p1/audio.wav", "id")
    assert "anu" in prompt
    # Rentang ucapan + padding 200 ms, digabung bila celah ≤ 2 dtk, dijepit ke durasi.
    assert ranges == [TimeRange(0, 4200), TimeRange(7800, 10_000)]

    saved = transcripts.saved["s1"]
    assert (saved.project_id, saved.language) == ("p1", "id")
    assert [(t.id, t.type, t.text, t.start_ms, t.end_ms) for t in saved.tokens] == [
        ("w1", "filler", "Eh,", 100, 300),
        # Kata terakhir di rentang ucapan diperpanjang ke tepinya (2000).
        ("w2", "word", "halo", 500, 2000),
        # Rentang ucapan 3000–4000 tanpa kata (halusinasinya dibuang) bukan bagian jeda.
        ("p1", "pause", "", 2000, 3000),
        ("p2", "pause", "", 4000, 8000),
        # Diselaraskan ke rentang ucapan 8000–9900 (bukan sampai durasi 10 000).
        ("w3", "word", "semua.", 8000, 9900),
    ]
    assert result == {
        "transcriptId": "t-s1",
        "language": "id",
        "wordCount": 3,
        "fillerCount": 1,
        "pauseCount": 2,
        "droppedWords": 2,
        "speechMs": 1900 + 1000 + 1900,
        "languageScores": {"ms": 0.5, "en": 0.3, "id": 0.2},
        "discoverJobId": "job-1",
    }
    [discover] = jobs.jobs.values()
    assert (discover.type, discover.project_id, discover.payload) == (
        "discover",
        "p1",
        {"sourceId": "s1"},
    )
    assert progress == sorted(progress)
    assert progress[0] == 1.5
    assert progress[-1] == 98


def test_english_audio_uses_english_prompt_and_reports_top_scores_only() -> None:
    transcriber = FakeTranscriber(
        {"en": 0.9, "id": 0.05, "ms": 0.03, "ja": 0.0199, "fr": 0.0001}, WORDS
    )
    result = run(transcriber)
    [(_, language, prompt, _)] = transcriber.transcribe_calls
    assert language == "en"
    assert "uh" in prompt
    assert result["languageScores"] == {"en": 0.9, "id": 0.05, "ms": 0.03}


def test_custom_filler_list_is_read_for_every_job() -> None:
    transcripts = FakeTranscripts()
    # Daftar dari halaman Settings: diubah di antara dua job.
    lists: list[list[str] | None] = [["halo"], [], None]
    use_case = TranscribeJob(
        FakeSources(READY),
        transcripts,
        FakeVad(SPEECH),
        FakeTranscriber({"id": 1.0}, WORDS),
        InMemoryJobRepository(),
        filler_words=lambda: lists.pop(0),
    )

    def fillers() -> list[str]:
        use_case(job({"sourceId": "s1"}), lambda _: None)
        return [t.text for t in transcripts.saved["s1"].tokens if t.type == "filler"]

    assert fillers() == ["halo"]
    assert fillers() == []
    assert fillers() == ["Eh,"]  # None = daftar bawaan


def test_audio_without_speech_skips_whisper_and_saves_empty_transcript() -> None:
    transcripts = FakeTranscripts()
    transcriber = FakeTranscriber({"en": 1.0}, WORDS)
    jobs = InMemoryJobRepository()

    result = run(transcriber, speech=[], transcripts=transcripts, jobs=jobs)

    assert transcriber.detect_calls == []
    assert transcriber.transcribe_calls == []
    saved = transcripts.saved["s1"]
    assert (saved.language, list(saved.tokens)) == (None, [])
    assert result == {
        "transcriptId": "t-s1",
        "language": None,
        "wordCount": 0,
        "speechMs": 0,
        "discoverJobId": "job-1",
    }
    # Discover tetap diantre agar proyek selesai dengan 0 klip (tanpa memanggil Gemini).
    assert [j.type for j in jobs.jobs.values()] == ["discover"]


def test_fails_for_unknown_source() -> None:
    with pytest.raises(JobFailure, match="tidak ditemukan"):
        TranscribeJob(
            FakeSources(),
            FakeTranscripts(),
            FakeVad(SPEECH),
            FakeTranscriber({}, []),
            InMemoryJobRepository(),
        )(job({"sourceId": "hilang"}), lambda _: None)


def test_fails_when_audio_not_extracted_yet() -> None:
    pending = SourceRecord(id="s1", project_id="p1", path="media/p1/source.mp4")
    transcriber = FakeTranscriber({}, [])
    jobs = InMemoryJobRepository()
    with pytest.raises(JobFailure, match="Audio belum diekstrak"):
        run(transcriber, source=pending, jobs=jobs)
    assert transcriber.detect_calls == []
    assert jobs.jobs == {}


class FakeAudio:
    """Mencatat urutan panggilan bersama transkrip yang tersimpan (audio dihapus paling akhir)."""

    def __init__(self, events: list[str]) -> None:
        self.events = events

    def ensure(self, source_path: str, audio_path: str, duration_ms: int) -> None:
        self.events.append(f"ensure {source_path} {audio_path} {duration_ms}")

    def discard(self, audio_path: str) -> None:
        self.events.append(f"discard {audio_path}")


class RecordingTranscripts(FakeTranscripts):
    def __init__(self, events: list[str]) -> None:
        super().__init__()
        self.events = events

    def save(self, transcript: Transcript) -> str:
        self.events.append("save")
        return super().save(transcript)


@pytest.mark.parametrize("speech", [SPEECH, []], ids=["ucapan", "tanpa-ucapan"])
def test_audio_is_ensured_first_and_discarded_after_transcript_is_saved(
    speech: list[TimeRange],
) -> None:
    events: list[str] = []
    TranscribeJob(
        FakeSources(READY),
        RecordingTranscripts(events),
        FakeVad(speech),
        FakeTranscriber({"id": 1.0}, WORDS),
        InMemoryJobRepository(),
        audio=FakeAudio(events),
    )(job({"sourceId": "s1"}), lambda _: None)
    assert events == [
        "ensure media/p1/source.mp4 media/p1/audio.wav 10000",
        "save",
        "discard media/p1/audio.wav",
    ]


def test_failed_transcription_keeps_audio_for_retry() -> None:
    events: list[str] = []

    class BrokenTranscriber(FakeTranscriber):
        def transcribe(
            self,
            audio_path: str,
            language: Language,
            initial_prompt: str,
            ranges: Sequence[TimeRange],
            on_progress: StepProgress,
        ) -> list[RecognizedWord]:
            raise RuntimeError("Whisper gagal")

    with pytest.raises(RuntimeError):
        TranscribeJob(
            FakeSources(READY),
            RecordingTranscripts(events),
            FakeVad(SPEECH),
            BrokenTranscriber({"id": 1.0}, WORDS),
            InMemoryJobRepository(),
            audio=FakeAudio(events),
        )(job({"sourceId": "s1"}), lambda _: None)
    assert events == ["ensure media/p1/source.mp4 media/p1/audio.wav 10000"]


def test_unavailable_audio_fails_with_user_message_and_queues_nothing() -> None:
    class MissingAudio(FakeAudio):
        def ensure(self, source_path: str, audio_path: str, duration_ms: int) -> None:
            raise AudioUnavailableError("Audio sudah dihapus dan video sumber belum ada.")

    jobs = InMemoryJobRepository()
    with pytest.raises(JobFailure, match="video sumber belum ada"):
        TranscribeJob(
            FakeSources(READY),
            FakeTranscripts(),
            FakeVad(SPEECH),
            FakeTranscriber({"id": 1.0}, WORDS),
            jobs,
            audio=MissingAudio([]),
        )(job({"sourceId": "s1"}), lambda _: None)
    assert jobs.jobs == {}
