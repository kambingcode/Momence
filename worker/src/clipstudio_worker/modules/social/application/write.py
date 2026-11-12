from collections.abc import Mapping
from typing import Any

from clipstudio_worker.modules.jobs.application import Job, JobFailure, ReportProgress
from clipstudio_worker.modules.social.application.payloads import PostCopyPayload
from clipstudio_worker.modules.social.application.ports import (
    PostCopyError,
    PostCopyRequest,
    PostCopyWriter,
)
from clipstudio_worker.modules.social.domain.copy import build_post_copy


class WritePostCopyJob:
    """Minta LLM menulis caption + hashtag posting untuk satu klip, lalu rapikan dengan aturan
    domain (panjang, bentuk & duplikat hashtag). Hasil disimpan di `jobs.result`; tidak menulis
    apa pun selain itu, jadi aman diulang."""

    def __init__(self, writer: PostCopyWriter) -> None:
        self._writer = writer

    def __call__(self, job: Job, report_progress: ReportProgress) -> Mapping[str, Any]:
        payload = PostCopyPayload.model_validate(job.payload)
        transcript = payload.transcript.strip()
        if not transcript:
            raise JobFailure("Klip ini tidak berisi ucapan, jadi tidak ada bahan untuk caption.")
        report_progress(5)

        request = PostCopyRequest(
            payload.title, payload.hook, transcript, payload.platform, payload.language
        )
        try:
            draft = self._writer.write(request)
        except PostCopyError as exc:
            raise JobFailure(str(exc)) from exc
        copy = build_post_copy(draft.caption, draft.alt_caption, draft.hashtags, payload.platform)
        if not copy.caption:
            raise JobFailure("Gemini tidak menghasilkan caption. Coba buat ulang.")
        usage = draft.usage
        return {
            "clipId": payload.clip_id,
            "platform": payload.platform,
            "caption": copy.caption,
            "altCaption": copy.alt_caption,
            "hashtags": list(copy.hashtags),
            "usage": {
                "inputTokens": usage.input_tokens,
                "outputTokens": usage.output_tokens,
                "cacheReadInputTokens": usage.cache_read_input_tokens,
                "cacheCreationInputTokens": usage.cache_creation_input_tokens,
            },
        }
