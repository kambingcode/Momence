from collections import Counter
from collections.abc import Callable, Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from clipstudio_worker.modules.clips.application.ports import (
    ClipFocusReader,
    ClipRepository,
    ClipSuggester,
    ClipSuggestionError,
    KeptClip,
    ProxyReadiness,
    SuggestionRequest,
    Suggestions,
    TokenUsage,
)
from clipstudio_worker.modules.clips.domain.clip import (
    DiscoveredClip,
    remove_duplicates,
    resolve_candidate,
    without_overlaps,
)
from clipstudio_worker.modules.clips.domain.scoring import rank_clips
from clipstudio_worker.modules.clips.domain.sentences import split_sentences
from clipstudio_worker.modules.clips.domain.windows import split_windows
from clipstudio_worker.modules.jobs.application import (
    Job,
    JobFailure,
    JobRepository,
    ReportProgress,
)
from clipstudio_worker.modules.reframe.application import ReframePayload
from clipstudio_worker.modules.transcript.application import (
    DiscoverPayload,
    TranscriptRepository,
)

# Bobot progres: persiapan 0–2, Gemini per jendela 2–98, simpan 98–100.
_PREPARE_END = 2
_SUGGEST_END = 98


class DiscoverClipsJob:
    """Pecah transkrip per kalimat & jendela ±10 menit, minta kandidat klip ke LLM per jendela,
    validasi (batas kalimat, 15–90 dtk), buang duplikat tumpang-tindih, beri skor 60–99 &
    peringkat, lalu simpan dan antre satu job `reframe` (analisis wajah) untuk semua klipnya.

    Idempoten: dijalankan ulang akan mengganti klip milik video sumber yang sama, kecuali klip
    yang sudah diedit pengguna — klip itu dipertahankan, usulan baru yang menduplikasinya
    dibuang, dan semua klip diberi peringkat ulang bersama.

    Jendela pertama diminta sendirian (menulis cache prompt sistem), sisanya paling banyak
    `concurrency` permintaan bersamaan. Hasil diproses menurut urutan jendela, jadi klip yang
    tersimpan sama dengan mode berurutan; satu jendela gagal → job gagal tanpa menyimpan apa pun.
    """

    def __init__(
        self,
        transcripts: TranscriptRepository,
        suggester: ClipSuggester,
        clips: ClipRepository,
        jobs: JobRepository,
        focus: ClipFocusReader,
        concurrency: int = 1,
        proxies: ProxyReadiness | None = None,
    ) -> None:
        if concurrency < 1:
            raise ValueError("concurrency minimal 1")
        self._concurrency = concurrency
        # None = proxy dianggap sudah siap (ingest selalu lebih dulu, seperti sebelum T17.4).
        self._proxies = proxies
        self._transcripts = transcripts
        self._suggester = suggester
        self._clips = clips
        self._jobs = jobs
        self._focus = focus

    def __call__(self, job: Job, report_progress: ReportProgress) -> Mapping[str, Any]:
        payload = DiscoverPayload.model_validate(job.payload)
        transcript = self._transcripts.get_by_source(payload.source_id)
        if transcript is None:
            raise JobFailure("Transkrip belum ada. Jalankan ulang transkripsi.")

        focus = self._focus.clip_focus(transcript.project_id)
        windows = split_windows(split_sentences(transcript.tokens))
        report_progress(_PREPARE_END)

        requests = [
            SuggestionRequest(transcript.language, number, len(windows), window, focus)
            for number, window in enumerate(windows, start=1)
        ]
        all_suggestions = self._suggest_all(
            requests,
            lambda done: report_progress(
                _PREPARE_END + done / len(windows) * (_SUGGEST_END - _PREPARE_END)
            ),
        )

        found: list[DiscoveredClip] = []
        rejected: Counter[str] = Counter()
        candidate_count = 0
        usage = TokenUsage()
        for window, suggestions in zip(windows, all_suggestions, strict=True):
            usage += suggestions.usage
            for candidate in suggestions.candidates:
                candidate_count += 1
                resolved = resolve_candidate(candidate, window)
                if isinstance(resolved, DiscoveredClip):
                    found.append(resolved)
                else:
                    rejected[resolved] += 1

        edited = self._clips.edited_for_source(transcript.project_id, transcript.source_id)
        unique = remove_duplicates(found)
        fresh = without_overlaps(unique, [e.clip for e in edited])
        ranked = rank_clips([*(e.clip for e in edited), *fresh])
        # Cocokkan lewat identitas objek: DiscoveredClip berisi dict sehingga tidak bisa di-hash.
        kept = [KeptClip(e.id, next(r for r in ranked if r.clip is e.clip)) for e in edited]
        new = [r for r in ranked if all(r.clip is not e.clip for e in edited)]
        new_ids = self._clips.replace_for_source(
            transcript.project_id, transcript.source_id, new, kept
        )
        clip_ids = [*new_ids, *(k.id for k in kept)]
        reframe_job_id = None
        # Proxy belum jadi (video penuh masih diunduh/diproses): `IngestJob` yang mengantre
        # `reframe` begitu proxy siap.
        proxy_ready = self._proxies is None or self._proxies.proxy_ready(transcript.source_id)
        if clip_ids and proxy_ready:
            # Klip yang sudah diedit biasanya sudah dianalisis; job reframe melewatinya.
            reframe_payload = ReframePayload.model_validate({"clipIds": clip_ids}).model_dump(
                by_alias=True
            )
            reframe_job_id = self._jobs.enqueue(
                "reframe", transcript.project_id, reframe_payload
            ).id
        return {
            "clipCount": len(ranked),
            "clipIds": clip_ids,
            "reframeJobId": reframe_job_id,
            "reframeWaitsForProxy": bool(clip_ids) and not proxy_ready,
            "keptEditedCount": len(kept),
            "windowCount": len(windows),
            "clipFocus": focus,
            "candidateCount": candidate_count,
            "duplicateCount": len(found) - len(fresh),
            "rejected": dict(sorted(rejected.items())),
            "usage": {
                "inputTokens": usage.input_tokens,
                "outputTokens": usage.output_tokens,
                "cacheReadInputTokens": usage.cache_read_input_tokens,
                "cacheCreationInputTokens": usage.cache_creation_input_tokens,
            },
        }

    def _suggest_all(
        self, requests: Sequence[SuggestionRequest], on_done: Callable[[int], None]
    ) -> list[Suggestions]:
        """Usulan per jendela, urut sesuai `requests`. `on_done(n)` dipanggil di thread pemanggil
        setiap kali n jendela selesai."""
        results: dict[int, Suggestions] = {}

        def finished(index: int, suggestions: Suggestions) -> None:
            results[index] = suggestions
            on_done(len(results))

        if requests:
            # Pertama sendirian: prompt sistem masuk cache dan dibaca jendela lain.
            finished(0, self._suggest(requests[0]))
        rest = range(1, len(requests))
        workers = min(self._concurrency, len(rest))
        if workers <= 1:
            for index in rest:
                finished(index, self._suggest(requests[index]))
        else:
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futures = {pool.submit(self._suggest, requests[i]): i for i in rest}
                try:
                    for future in as_completed(futures):
                        finished(futures[future], future.result())
                except BaseException:
                    # Jendela yang belum mulai dibatalkan; yang sedang berjalan ditunggu selesai.
                    pool.shutdown(wait=True, cancel_futures=True)
                    raise
        return [results[i] for i in range(len(requests))]

    def _suggest(self, request: SuggestionRequest) -> Suggestions:
        try:
            return self._suggester.suggest(request)
        except ClipSuggestionError as exc:
            raise JobFailure(str(exc)) from exc
