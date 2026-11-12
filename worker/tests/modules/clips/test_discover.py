import threading
from collections.abc import Sequence

import pytest

from clipstudio_worker.modules.clips.application import (
    ClipCandidate,
    ClipFocusReader,
    ClipRepository,
    ClipSuggester,
    ClipSuggestionError,
    DiscoverClipsJob,
    DiscoveredClip,
    EditedClip,
    KeptClip,
    ProxyReadiness,
    RankedClip,
    Subscore,
    SubscoreName,
    SuggestionRequest,
    Suggestions,
    TokenUsage,
)
from clipstudio_worker.modules.jobs.application import Job, JobFailure
from clipstudio_worker.modules.transcript.application import (
    Token,
    Transcript,
    TranscriptRepository,
)
from tests.modules.jobs.fakes import InMemoryJobRepository

MINUTE = 60_000


def tokens(total_ms: int) -> list[Token]:
    """Satu kalimat per 10 dtk (dua kata), dengan jeda pendek di antaranya."""
    result: list[Token] = []
    for n, start in enumerate(range(0, total_ms, 10_000), start=1):
        result.append(Token(f"w{2 * n - 1}", "word", "Kalimat", start, start + 4_000))
        result.append(Token(f"w{2 * n}", "word", f"{n}.", start + 4_000, start + 9_600))
        result.append(Token(f"p{n}", "pause", "", start + 9_600, start + 10_000))
    return result


def scores(total: int) -> dict[SubscoreName, Subscore]:
    return {
        "hook": Subscore(total - 15, "h"),
        "flow": Subscore(5, "f"),
        "value": Subscore(5, "v"),
        "trend": Subscore(5, "t"),
    }


class FakeTranscripts(TranscriptRepository):
    def __init__(self, *transcripts: Transcript) -> None:
        self.transcripts = {t.source_id: t for t in transcripts}

    def save(self, transcript: Transcript) -> str:
        raise AssertionError("discover tidak boleh mengubah transkrip")

    def get_by_source(self, source_id: str) -> Transcript | None:
        return self.transcripts.get(source_id)


class FakeSuggester(ClipSuggester):
    """Untuk tiap jendela: satu klip 30 dtk, satu terlalu pendek, satu di area tumpang-tindih."""

    def __init__(self, error_on_window: int | None = None) -> None:
        self.requests: list[SuggestionRequest] = []
        self.error_on_window = error_on_window

    def suggest(self, request: SuggestionRequest) -> Suggestions:
        self.requests.append(request)
        if request.window_number == self.error_on_window:
            raise ClipSuggestionError("Batas pemakaian Gemini API tercapai.")
        first = request.sentences[0].number
        return Suggestions(
            candidates=[
                ClipCandidate(first + 10, first + 12, "Klip", "hook", scores(20)),
                ClipCandidate(first, first, "Terlalu pendek", "", scores(30)),
                # Sama persis di setiap jendela yang mencakup kalimat 55–57 → duplikat.
                ClipCandidate(
                    55, 57, "Di area tumpang-tindih", "", scores(20 + request.window_number)
                ),
            ],
            usage=TokenUsage(100, 10, 50, 5),
        )


class FakeFocus(ClipFocusReader):
    def __init__(self, focus: str | None = None) -> None:
        self.focus = focus
        self.asked: list[str] = []

    def clip_focus(self, project_id: str) -> str | None:
        self.asked.append(project_id)
        return self.focus


class FakeClips(ClipRepository):
    def __init__(self, *edited: EditedClip) -> None:
        self.edited = list(edited)
        self.saved: dict[str, tuple[str, list[RankedClip]]] = {}
        self.kept: list[KeptClip] = []

    def edited_for_source(self, project_id: str, source_id: str) -> list[EditedClip]:
        return self.edited

    def replace_for_source(
        self,
        project_id: str,
        source_id: str,
        new: Sequence[RankedClip],
        kept: Sequence[KeptClip],
    ) -> list[str]:
        self.saved[project_id] = (source_id, list(new))
        self.kept = list(kept)
        return [f"c{i}" for i in range(1, len(new) + 1)]


def job(source_id: str = "s1") -> Job:
    return Job(
        id="j1",
        project_id="p1",
        type="discover",
        status="running",
        progress=0,
        payload={"sourceId": source_id},
        attempts=1,
    )


def transcript(total_ms: int) -> Transcript:
    return Transcript("p1", "s1", "id", tokens(total_ms))


def test_discovers_clips_per_window_removes_duplicates_and_ranks() -> None:
    suggester = FakeSuggester()
    clips = FakeClips()
    jobs = InMemoryJobRepository()
    progress: list[float] = []

    result = DiscoverClipsJob(
        FakeTranscripts(transcript(22 * MINUTE)), suggester, clips, jobs, FakeFocus()
    )(job(), progress.append)

    # 22 menit → 2 jendela: kalimat 1–60 (0:00–10:00) & 52–132 (8:30–22:00).
    assert [(r.window_number, r.window_count, r.language) for r in suggester.requests] == [
        (1, 2, "id"),
        (2, 2, "id"),
    ]
    assert [(r.sentences[0].number, r.sentences[-1].number) for r in suggester.requests] == [
        (1, 60),
        (52, 132),
    ]
    source_id, saved = clips.saved["p1"]
    assert source_id == "s1"
    # Kalimat 55–57 diusulkan di kedua jendela → yang skornya lebih tinggi (jendela 2, total 22)
    # disimpan. Urut peringkat; dua klip total 20 seri → skor sama, yang lebih awal di atas.
    assert [
        (r.clip.title, r.clip.start_ms, r.clip.end_ms, r.raw_score, r.score, r.rank) for r in saved
    ] == [
        ("Di area tumpang-tindih", 540_000, 569_600, 5.5, 99, 1),
        ("Klip", 100_000, 129_600, 5, 80, 2),
        ("Klip", 610_000, 639_600, 5, 80, 3),
    ]
    assert (saved[1].clip.start_token_id, saved[1].clip.end_token_id) == ("w21", "w26")
    assert clips.kept == []
    # Satu job analisis wajah untuk semua klip.
    [reframe] = jobs.jobs.values()
    assert (reframe.type, reframe.project_id, reframe.payload) == (
        "reframe",
        "p1",
        {"clipIds": ["c1", "c2", "c3"]},
    )
    assert result == {
        "clipCount": 3,
        "clipIds": ["c1", "c2", "c3"],
        "reframeJobId": reframe.id,
        "reframeWaitsForProxy": False,
        "keptEditedCount": 0,
        "windowCount": 2,
        "clipFocus": None,
        "candidateCount": 6,
        "duplicateCount": 1,
        "rejected": {"too_short": 2},
        "usage": {
            "inputTokens": 200,
            "outputTokens": 20,
            "cacheReadInputTokens": 100,
            "cacheCreationInputTokens": 10,
        },
    }
    assert progress == sorted(progress)
    assert progress[0] == 2
    assert progress[-1] == 98


def test_keeps_edited_clips_drops_new_duplicates_of_them_and_reranks_all() -> None:
    # Klip yang sudah diedit menimpa area kalimat 55–57 (540–569,6 dtk) dengan skor rendah.
    edited = DiscoveredClip("Sudah diedit", "", 538_000, 570_000, "x1", "x2", scores(16))
    clips = FakeClips(EditedClip("lama", edited))
    jobs = InMemoryJobRepository()

    result = DiscoverClipsJob(
        FakeTranscripts(transcript(22 * MINUTE)), FakeSuggester(), clips, jobs, FakeFocus()
    )(job(), lambda _: None)

    _, new = clips.saved["p1"]
    # Usulan baru untuk kalimat 55–57 dibuang karena menduplikasi klip yang diedit.
    assert [(r.clip.start_ms, r.score, r.rank) for r in new] == [(100_000, 99, 1), (610_000, 99, 2)]
    assert [(k.id, k.ranked.clip is edited, k.ranked.score, k.ranked.rank) for k in clips.kept] == [
        ("lama", True, 60, 3)
    ]
    assert result["clipIds"] == ["c1", "c2", "lama"]
    # Klip yang diedit ikut diantre; job reframe melewatinya bila analisisnya masih berlaku.
    assert [j.payload for j in jobs.jobs.values()] == [{"clipIds": ["c1", "c2", "lama"]}]
    assert (result["clipCount"], result["keptEditedCount"], result["duplicateCount"]) == (3, 1, 2)


def test_transcript_without_speech_saves_no_clips_without_calling_llm() -> None:
    suggester = FakeSuggester()
    clips = FakeClips()
    empty = Transcript("p1", "s1", None, [Token("p1", "pause", "", 0, 9000)])
    jobs = InMemoryJobRepository()

    result = DiscoverClipsJob(FakeTranscripts(empty), suggester, clips, jobs, FakeFocus())(
        job(), lambda _: None
    )

    assert suggester.requests == []
    # Tanpa klip → tidak ada yang dianalisis.
    assert jobs.jobs == {}
    assert result["reframeJobId"] is None
    assert clips.saved["p1"] == ("s1", [])
    assert (result["clipCount"], result["windowCount"]) == (0, 0)


def test_llm_error_fails_job_without_touching_existing_clips() -> None:
    clips = FakeClips()
    jobs = InMemoryJobRepository()
    use_case = DiscoverClipsJob(
        FakeTranscripts(transcript(22 * MINUTE)),
        FakeSuggester(error_on_window=2),
        clips,
        jobs,
        FakeFocus(),
    )
    with pytest.raises(JobFailure, match="Batas pemakaian"):
        use_case(job(), lambda _: None)
    assert clips.saved == {}
    assert jobs.jobs == {}


def test_fails_when_transcript_missing() -> None:
    with pytest.raises(JobFailure, match="Transkrip belum ada"):
        DiscoverClipsJob(
            FakeTranscripts(),
            FakeSuggester(),
            FakeClips(),
            InMemoryJobRepository(),
            FakeFocus(),
        )(job("hilang"), lambda _: None)


def test_passes_project_focus_to_every_window_and_reports_it() -> None:
    suggester = FakeSuggester()
    focus = FakeFocus("momen lucu dan reaksi")

    result = DiscoverClipsJob(
        FakeTranscripts(transcript(22 * MINUTE)),
        suggester,
        FakeClips(),
        InMemoryJobRepository(),
        focus,
    )(job(), lambda _: None)

    assert focus.asked == ["p1"]
    assert [r.focus for r in suggester.requests] == ["momen lucu dan reaksi"] * 2
    assert result["clipFocus"] == "momen lucu dan reaksi"


def test_without_focus_requests_carry_none() -> None:
    suggester = FakeSuggester()

    result = DiscoverClipsJob(
        FakeTranscripts(transcript(22 * MINUTE)),
        suggester,
        FakeClips(),
        InMemoryJobRepository(),
        FakeFocus(),
    )(job(), lambda _: None)

    assert [r.focus for r in suggester.requests] == [None, None]
    assert result["clipFocus"] is None


class OutOfOrderSuggester(FakeSuggester):
    """Jendela ≥ 2 baru selesai setelah jendela berikutnya selesai → urutan selesai terbalik.
    Mencatat jendela yang sedang berjalan bersamaan."""

    def __init__(self, window_count: int, error_on_window: int | None = None) -> None:
        super().__init__(error_on_window)
        self.window_count = window_count
        self.done = {n: threading.Event() for n in range(1, window_count + 1)}
        self.lock = threading.Lock()
        self.running = 0
        self.peak = 0
        self.finish_order: list[int] = []
        self.running_when_first_finished = -1

    def suggest(self, request: SuggestionRequest) -> Suggestions:
        number = request.window_number
        with self.lock:
            self.running += 1
            self.peak = max(self.peak, self.running)
        try:
            if 2 <= number < self.window_count and number != self.error_on_window:
                assert self.done[number + 1].wait(5), "jendela berikutnya tidak berjalan paralel"
            return super().suggest(request)
        finally:
            with self.lock:
                self.running -= 1
                self.finish_order.append(number)
                if number == 1:
                    self.running_when_first_finished = self.running
            self.done[number].set()


def run_discover(
    suggester: ClipSuggester, concurrency: int, total_ms: int = 52 * MINUTE
) -> tuple[dict[str, object], FakeClips, list[float]]:
    clips = FakeClips()
    progress: list[float] = []
    result = DiscoverClipsJob(
        FakeTranscripts(transcript(total_ms)),
        suggester,
        clips,
        InMemoryJobRepository(),
        FakeFocus(),
        concurrency=concurrency,
    )(job(), progress.append)
    return dict(result), clips, progress


def test_parallel_windows_give_the_same_clips_as_sequential() -> None:
    sequential, seq_clips, _ = run_discover(FakeSuggester(), concurrency=1)
    windows = int(str(sequential["windowCount"]))
    assert windows >= 4

    suggester = OutOfOrderSuggester(windows)
    parallel, par_clips, progress = run_discover(suggester, concurrency=windows)

    # Jendela pertama sendirian (cache prompt sistem), sisanya bersamaan & selesai terbalik.
    assert suggester.finish_order[0] == 1
    assert suggester.running_when_first_finished == 0
    assert suggester.finish_order[1:] == list(range(windows, 1, -1))
    assert suggester.peak == windows - 1
    # Hasil identik dengan mode berurutan (id job reframe berbeda per repositori).
    assert {k: v for k, v in parallel.items() if k != "reframeJobId"} == {
        k: v for k, v in sequential.items() if k != "reframeJobId"
    }
    assert par_clips.saved == seq_clips.saved
    assert progress == sorted(progress) and len(progress) == len(set(progress))
    assert (progress[0], progress[-1]) == (2, 98)


def test_concurrency_limits_simultaneous_requests() -> None:
    suggester = FakeSuggester()
    peak = 0
    running = 0
    lock = threading.Lock()
    original = suggester.suggest

    def counting(request: SuggestionRequest) -> Suggestions:
        nonlocal peak, running
        with lock:
            running += 1
            peak = max(peak, running)
        try:
            threading.Event().wait(0.01)
            return original(request)
        finally:
            with lock:
                running -= 1

    suggester.suggest = counting  # type: ignore[method-assign]
    result, _, _ = run_discover(suggester, concurrency=2)
    assert int(str(result["windowCount"])) >= 4
    assert peak == 2


class SlowSuggester(FakeSuggester):
    """Jendela selain yang gagal butuh 200 ms, sehingga pembatalan sempat terjadi."""

    def suggest(self, request: SuggestionRequest) -> Suggestions:
        if request.window_number not in (1, self.error_on_window):
            threading.Event().wait(0.2)
        return super().suggest(request)


def test_parallel_failure_saves_nothing_and_skips_pending_windows() -> None:
    total_ms = 90 * MINUTE
    windows = int(str(run_discover(FakeSuggester(), 1, total_ms)[0]["windowCount"]))
    assert windows >= 8
    clips = FakeClips()
    jobs = InMemoryJobRepository()
    # Jendela 2 gagal seketika; 2 permintaan bersamaan → paling banyak jendela 1–4 sempat mulai,
    # sisanya dibatalkan.
    suggester = SlowSuggester(error_on_window=2)
    use_case = DiscoverClipsJob(
        FakeTranscripts(transcript(total_ms)),
        suggester,
        clips,
        jobs,
        FakeFocus(),
        concurrency=2,
    )
    with pytest.raises(JobFailure, match="Batas pemakaian"):
        use_case(job(), lambda _: None)
    assert clips.saved == {}
    assert jobs.jobs == {}
    assert {r.window_number for r in suggester.requests} <= {1, 2, 3, 4}


def test_concurrency_must_be_positive() -> None:
    with pytest.raises(ValueError, match="minimal 1"):
        DiscoverClipsJob(
            FakeTranscripts(),
            FakeSuggester(),
            FakeClips(),
            InMemoryJobRepository(),
            FakeFocus(),
            concurrency=0,
        )


class FakeProxies(ProxyReadiness):
    def __init__(self, ready: bool) -> None:
        self.ready = ready
        self.asked: list[str] = []

    def proxy_ready(self, source_id: str) -> bool:
        self.asked.append(source_id)
        return self.ready


def test_reframe_is_queued_only_when_the_proxy_is_ready() -> None:
    for ready in (True, False):
        jobs, proxies = InMemoryJobRepository(), FakeProxies(ready)

        result = DiscoverClipsJob(
            FakeTranscripts(transcript(22 * MINUTE)),
            FakeSuggester(),
            FakeClips(),
            jobs,
            FakeFocus(),
            proxies=proxies,
        )(job(), lambda _: None)

        assert proxies.asked == ["s1"]
        assert result["clipCount"] == 3
        assert [j.type for j in jobs.jobs.values()] == (["reframe"] if ready else [])
        assert (result["reframeJobId"] is not None, result["reframeWaitsForProxy"]) == (
            ready,
            not ready,
        )


def test_no_clips_never_waits_for_the_proxy() -> None:
    empty = Transcript("p1", "s1", None, [Token("p1", "pause", "", 0, 9000)])
    result = DiscoverClipsJob(
        FakeTranscripts(empty),
        FakeSuggester(),
        FakeClips(),
        InMemoryJobRepository(),
        FakeFocus(),
        proxies=FakeProxies(False),
    )(job(), lambda _: None)
    assert (result["reframeJobId"], result["reframeWaitsForProxy"]) == (None, False)
