from collections.abc import Callable, Iterable, Mapping
from typing import Any

from clipstudio_worker.modules.jobs.application import (
    Job,
    JobFailure,
    JobRepository,
    ReportProgress,
)
from clipstudio_worker.modules.projects.application import SourceRepository, TranscribePayload
from clipstudio_worker.modules.transcript.application.payloads import DiscoverPayload
from clipstudio_worker.modules.transcript.application.ports import (
    AudioCache,
    AudioUnavailableError,
    Transcriber,
    Transcript,
    TranscriptRepository,
    VoiceActivityDetector,
)
from clipstudio_worker.modules.transcript.domain.markers import (
    DEFAULT_FILLER_WORDS,
    insert_pauses,
    mark_fillers,
)
from clipstudio_worker.modules.transcript.domain.speech import (
    align_to_speech,
    decode_ranges,
    keep_spoken,
)
from clipstudio_worker.modules.transcript.domain.transcript import (
    build_word_tokens,
    choose_language,
    disfluency_prompt,
    drop_compressed_repeats,
)

# Bobot progres per langkah (total 100).
_VAD_END = 3
_DETECT_END = 5
_TRANSCRIBE_END = 98


class TranscribeJob:
    """Cari bagian berisi ucapan (VAD), deteksi bahasa (id/en), transkripsi per kata hanya pada
    bagian itu, tandai filler & sisipkan token jeda, simpan transkrip sumber, lalu antre `discover`.

    Idempoten: dijalankan ulang akan menimpa transkrip sumber yang sama. Setelah transkrip
    tersimpan, `audio.wav` dihapus (`audio`); percobaan ulang membuatnya lagi dari video sumber.
    """

    def __init__(
        self,
        sources: SourceRepository,
        transcripts: TranscriptRepository,
        vad: VoiceActivityDetector,
        transcriber: Transcriber,
        jobs: JobRepository,
        # Dibaca setiap job (daftar dari halaman Settings); None = `DEFAULT_FILLER_WORDS`.
        filler_words: Callable[[], Iterable[str] | None] = lambda: None,
        # None = audio dibiarkan apa adanya (tes yang tidak menguji penyimpanan).
        audio: AudioCache | None = None,
    ) -> None:
        self._sources = sources
        self._transcripts = transcripts
        self._vad = vad
        self._transcriber = transcriber
        self._jobs = jobs
        self._filler_words = filler_words
        self._audio = audio

    def __call__(self, job: Job, report_progress: ReportProgress) -> Mapping[str, Any]:
        payload = TranscribePayload.model_validate(job.payload)
        source = self._sources.get(payload.source_id)
        if source is None:
            raise JobFailure("Video sumber tidak ditemukan (proyek mungkin sudah dihapus).")
        if source.audio_path is None:
            raise JobFailure("Audio belum diekstrak. Jalankan ulang persiapan video.")
        if self._audio is not None and source.duration_ms is not None:
            try:
                self._audio.ensure(source.path, source.audio_path, source.duration_ms)
            except AudioUnavailableError as exc:
                raise JobFailure(str(exc)) from exc

        speech = self._vad.speech_ranges(source.audio_path, lambda f: report_progress(f * _VAD_END))
        report_progress(_VAD_END)
        if not speech:
            # Tanpa ucapan Whisper hanya akan berhalusinasi; simpan transkrip kosong.
            transcript_id = self._transcripts.save(
                Transcript(source.project_id, source.id, language=None, tokens=[])
            )
            discover_id = self._enqueue_discover(source.project_id, source.id)
            self._discard_audio(source.audio_path)
            return {
                "transcriptId": transcript_id,
                "language": None,
                "wordCount": 0,
                "speechMs": 0,
                "discoverJobId": discover_id,
            }

        probabilities = self._transcriber.detect_language(source.audio_path, speech)
        language = choose_language(probabilities)
        report_progress(_DETECT_END)

        words = self._transcriber.transcribe(
            source.audio_path,
            language,
            disfluency_prompt(language),
            decode_ranges(speech, source.duration_ms),
            lambda f: report_progress(_DETECT_END + f * (_TRANSCRIBE_END - _DETECT_END)),
        )
        spoken = drop_compressed_repeats(keep_spoken(words, speech))
        tokens = build_word_tokens(spoken, source.duration_ms)
        tokens = insert_pauses(
            mark_fillers(align_to_speech(tokens, speech), self._fillers()),
            speech,
            source.duration_ms,
        )
        transcript_id = self._transcripts.save(
            Transcript(source.project_id, source.id, language=language, tokens=tokens)
        )
        discover_id = self._enqueue_discover(source.project_id, source.id)
        self._discard_audio(source.audio_path)
        return {
            "transcriptId": transcript_id,
            "language": language,
            "wordCount": sum(1 for t in tokens if t.type != "pause"),
            "fillerCount": sum(1 for t in tokens if t.type == "filler"),
            "pauseCount": sum(1 for t in tokens if t.type == "pause"),
            # Halusinasi yang dibuang: kata di luar ucapan & pengulangan yang dimampatkan.
            "droppedWords": len(words) - len(spoken),
            "speechMs": sum(r.end_ms - r.start_ms for r in speech),
            "languageScores": _top_scores(probabilities),
            "discoverJobId": discover_id,
        }

    def _discard_audio(self, audio_path: str) -> None:
        if self._audio is not None:
            self._audio.discard(audio_path)

    def _fillers(self) -> Iterable[str]:
        words = self._filler_words()
        return DEFAULT_FILLER_WORDS if words is None else words

    def _enqueue_discover(self, project_id: str, source_id: str) -> str:
        payload = DiscoverPayload.model_validate({"sourceId": source_id}).model_dump(by_alias=True)
        return self._jobs.enqueue("discover", project_id, payload).id


def _top_scores(probabilities: Mapping[str, float], limit: int = 3) -> dict[str, float]:
    """Bahasa dengan peluang terbesar (untuk ditelusuri bila deteksi keliru)."""
    top = sorted(probabilities.items(), key=lambda item: item[1], reverse=True)[:limit]
    return {code: round(probability, 3) for code, probability in top}
