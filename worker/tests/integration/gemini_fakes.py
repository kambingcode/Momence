"""Klien Gemini tiruan untuk tes adapter (tanpa jaringan). Respons dibangun dari tipe SDK asli
agar `.text`, finish reason, dan usage terbaca persis seperti dari API."""

import json
from typing import Any, cast

from google import genai
from google.genai import errors, types


def response(
    payload: object | None,
    *,
    finish: str = "STOP",
    prompt_tokens: int = 1200,
    cached_tokens: int | None = None,
    output_tokens: int = 300,
    thoughts_tokens: int | None = None,
    raw_text: str | None = None,
) -> types.GenerateContentResponse:
    """`payload` None = tanpa kandidat (prompt diblokir); `raw_text` untuk JSON yang rusak."""
    text = raw_text if raw_text is not None else json.dumps(payload)
    candidates = (
        None
        if payload is None and raw_text is None
        else [
            types.Candidate(
                content=types.Content(role="model", parts=[types.Part(text=text)]),
                finish_reason=types.FinishReason(finish),
            )
        ]
    )
    return types.GenerateContentResponse(
        candidates=candidates,
        model_version="gemini-3.6-flash-001",
        response_id="resp_test",
        usage_metadata=types.GenerateContentResponseUsageMetadata(
            prompt_token_count=prompt_tokens,
            cached_content_token_count=cached_tokens,
            candidates_token_count=output_tokens,
            thoughts_token_count=thoughts_tokens,
        ),
    )


def client_error(code: int, message: str, reason: str | None = None) -> errors.ClientError:
    error: dict[str, Any] = {"code": code, "message": message, "status": "UNKNOWN"}
    if reason:
        error["details"] = [{"reason": reason}]
    return errors.ClientError(code, {"error": error})


class StubClient:
    def __init__(self, result: object) -> None:
        self.calls: list[dict[str, Any]] = []
        self.result = result
        self.models = self

    def generate_content(self, **kwargs: Any) -> object:
        self.calls.append(kwargs)
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result

    def as_client(self) -> genai.Client:
        return cast(genai.Client, self)


def user_texts(call: dict[str, Any]) -> list[str]:
    """Teks bagian-bagian pesan pengguna dari satu panggilan `generate_content`."""
    [content] = call["contents"]
    assert content.role == "user"
    return [part.text for part in content.parts]
