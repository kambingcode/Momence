"""Bagian bersama adapter Gemini API: klien, panggilan structured output, dan pesan galat untuk
pengguna. Ketiga adapter (klip, B-roll, caption) memakai pola yang sama: satu prompt sistem
tetap, beberapa bagian teks pengguna, dan jawaban JSON sesuai skema Pydantic."""

from collections.abc import Callable, Generator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

# Termasuk permintaan awal; SDK mengulang 408, 429, dan 5xx dengan backoff eksponensial.
_ATTEMPTS = 3
# Batas satu percobaan. Tanpa ini SDK menunggu tanpa batas saat Gemini padat (diukur: satu kata
# bisa 22 dtk, atau 504 setelah 39 dtk); jendela discover paling lama menjawab ±1–2 menit.
_TIMEOUT_MS = 180_000

# Finish reason yang berarti Gemini menolak atau memblokir jawabannya (filter keamanan).
_BLOCKED_REASONS = frozenset(
    {
        types.FinishReason.SAFETY,
        types.FinishReason.BLOCKLIST,
        types.FinishReason.PROHIBITED_CONTENT,
        types.FinishReason.SPII,
        types.FinishReason.RECITATION,
    }
)


def default_client(api_key: str | None) -> genai.Client:
    # Tanpa api_key, SDK membaca GEMINI_API_KEY / GOOGLE_API_KEY dari env; base URL bisa diganti
    # lewat GOOGLE_GEMINI_BASE_URL (dipakai server palsu e2e).
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            timeout=_TIMEOUT_MS, retry_options=types.HttpRetryOptions(attempts=_ATTEMPTS)
        ),
    )


@dataclass(frozen=True)
class GeminiAnswer[T: BaseModel]:
    """Jawaban yang sudah dicek: `parsed` None hanya bila diblokir/terpotong/salah format, dan
    `problem` menjelaskan sebabnya."""

    parsed: T | None
    problem: str | None  # "blocked" | "max_tokens" | "invalid" | None
    model: str
    # Token masukan tanpa cache, token keluaran (termasuk "thinking"), dan token dari cache.
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    response_id: str | None


def generate[T: BaseModel](
    client: genai.Client,
    *,
    model: str,
    system_prompt: str,
    parts: Sequence[str],
    schema: type[T],
    max_output_tokens: int,
) -> GeminiAnswer[T]:
    """Satu panggilan `generate_content` dengan structured output. Prompt sistem selalu sama di
    awal permintaan sehingga caching implisit Gemini bisa memakainya ulang."""
    response = client.models.generate_content(
        model=model,
        contents=[types.Content(role="user", parts=[types.Part(text=text) for text in parts])],
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=max_output_tokens,
            response_mime_type="application/json",
            response_json_schema=schema.model_json_schema(),
        ),
    )
    return read_answer(response, schema, model)


def read_answer[T: BaseModel](
    response: types.GenerateContentResponse, schema: type[T], model: str
) -> GeminiAnswer[T]:
    usage = response.usage_metadata
    prompt = (usage.prompt_token_count or 0) if usage else 0
    cached = (usage.cached_content_token_count or 0) if usage else 0
    output = (
        ((usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0)) if usage else 0
    )

    parsed: T | None = None
    problem: str | None = None
    candidate = response.candidates[0] if response.candidates else None
    finish = candidate.finish_reason if candidate else None
    if candidate is None or finish in _BLOCKED_REASONS:
        problem = "blocked"
    elif finish == types.FinishReason.MAX_TOKENS:
        problem = "max_tokens"
    else:
        try:
            parsed = schema.model_validate_json(response.text or "")
        except ValidationError:
            problem = "invalid"
    return GeminiAnswer(
        parsed=parsed,
        problem=problem,
        model=response.model_version or model,
        input_tokens=max(prompt - cached, 0),
        output_tokens=output,
        cached_tokens=cached,
        response_id=response.response_id,
    )


@contextmanager
def gemini_errors(model: str, error: Callable[[str], Exception]) -> Generator[None]:
    """Ubah galat SDK Gemini menjadi `error(pesan)` yang ditampilkan apa adanya ke pengguna."""
    try:
        yield
    except errors.ClientError as exc:
        raise error(_client_error_message(exc, model)) from exc
    except errors.APIError as exc:
        raise error(f"Gemini API gagal ({exc.code}): {exc.message}") from exc
    except httpx.TimeoutException as exc:
        raise error(
            "Gemini API terlalu lama menjawab (model sedang padat?). Coba lagi atau ganti model "
            "di halaman Pengaturan."
        ) from exc
    except (httpx.TransportError, ConnectionError) as exc:
        raise error("Tidak bisa terhubung ke Gemini API. Periksa koneksi internet.") from exc
    except ValueError as exc:
        # SDK melempar ValueError saat membuat klien bila tidak ada API key sama sekali.
        if "API key" not in str(exc):
            raise
        raise error("API key Gemini belum ada. Isi GEMINI_API_KEY di worker/.env.") from exc


def _client_error_message(exc: errors.ClientError, model: str) -> str:
    # Gemini membalas key salah dengan 400 INVALID_ARGUMENT + alasan API_KEY_INVALID; `str(exc)`
    # memuat seluruh detail galat.
    if exc.code == 401 or "API_KEY_INVALID" in str(exc) or "API key" in (exc.message or ""):
        return "API key Gemini ditolak. Periksa GEMINI_API_KEY di worker/.env."
    if exc.code == 403:
        return f"API key Gemini tidak punya akses ke model {model}."
    if exc.code == 404:
        return (
            f"Model Gemini {model} tidak ditemukan. Periksa model di halaman Pengaturan "
            "(kosong = CLIPSTUDIO_GEMINI_MODEL)."
        )
    if exc.code == 429:
        return "Batas pemakaian Gemini API tercapai. Coba lagi beberapa saat lagi."
    return f"Gemini API gagal ({exc.code}): {exc.message}"
