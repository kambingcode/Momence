from collections.abc import Mapping, Sequence
from typing import Any

from clipstudio_worker.modules.broll.application.payloads import BrollPlanPayload, BrollPlanToken
from clipstudio_worker.modules.broll.application.ports import (
    BrollPlanError,
    BrollPlanner,
    BrollPlanRequest,
)
from clipstudio_worker.modules.broll.domain.slots import (
    SpokenSentence,
    SpokenWord,
    select_slots,
)
from clipstudio_worker.modules.clips.application import split_sentences
from clipstudio_worker.modules.jobs.application import Job, JobFailure, ReportProgress


def spoken_sentences(tokens: Sequence[BrollPlanToken]) -> list[SpokenSentence]:
    """Kalimat klip (nomor mulai 1) beserta katanya; jeda tidak ikut."""
    position = {token.id: i for i, token in enumerate(tokens)}
    result: list[SpokenSentence] = []
    for sentence in split_sentences(tokens):
        span = tokens[position[sentence.first_token_id] : position[sentence.last_token_id] + 1]
        words = [
            SpokenWord(t.text, t.start_ms, t.end_ms)
            for t in span
            if t.type != "pause" and t.text.strip()
        ]
        result.append(SpokenSentence(sentence.number, sentence.text, words))
    return result


class PlanBrollJob:
    """Minta LLM menunjuk 2–4 tempat B-roll di klip (kalimat + frasa + kata kunci stok), lalu
    ubah menjadi slot waktu yang valid. Hasil (slot) disimpan di `jobs.result`; pengguna memilih
    video stoknya di editor. Tidak menulis apa pun selain hasil job, jadi aman diulang."""

    def __init__(self, planner: BrollPlanner) -> None:
        self._planner = planner

    def __call__(self, job: Job, report_progress: ReportProgress) -> Mapping[str, Any]:
        payload = BrollPlanPayload.model_validate(job.payload)
        sentences = [s for s in spoken_sentences(payload.tokens) if s.words]
        if not sentences:
            raise JobFailure("Klip ini tidak berisi ucapan, jadi tidak ada tempat untuk B-roll.")
        clip_start = sentences[0].words[0].start_ms
        clip_end = sentences[-1].words[-1].end_ms
        report_progress(5)

        try:
            planned = self._planner.plan(BrollPlanRequest(payload.title, sentences, clip_start))
        except BrollPlanError as exc:
            raise JobFailure(str(exc)) from exc
        plan = select_slots(planned.candidates, sentences, clip_start, clip_end)
        usage = planned.usage
        return {
            "clipId": payload.clip_id,
            "slots": [
                {
                    "startMs": slot.start_ms,
                    "endMs": slot.end_ms,
                    "sentence": slot.sentence,
                    "text": slot.text,
                    "intent": slot.intent,
                    "keywords": list(slot.keywords),
                }
                for slot in plan.slots
            ],
            "candidateCount": len(planned.candidates),
            "rejected": dict(sorted(plan.rejected.items())),
            "usage": {
                "inputTokens": usage.input_tokens,
                "outputTokens": usage.output_tokens,
                "cacheReadInputTokens": usage.cache_read_input_tokens,
                "cacheCreationInputTokens": usage.cache_creation_input_tokens,
            },
        }
