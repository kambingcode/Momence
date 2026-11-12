"""Port modul clips."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from clipstudio_worker.modules.clips.domain.clip import ClipCandidate, DiscoveredClip
from clipstudio_worker.modules.clips.domain.scoring import RankedClip
from clipstudio_worker.modules.clips.domain.sentences import Sentence


@dataclass(frozen=True)
class SuggestionRequest:
    language: str | None
    # Posisi jendela (mulai 1) & jumlah jendela, agar Gemini tahu konteks potongannya.
    window_number: int
    window_count: int
    sentences: Sequence[Sentence]
    # Arahan pengguna untuk seleksi klip (mis. "momen lucu"); None = tanpa fokus.
    focus: str | None = None


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

    def __add__(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(
            self.input_tokens + other.input_tokens,
            self.output_tokens + other.output_tokens,
            self.cache_read_input_tokens + other.cache_read_input_tokens,
            self.cache_creation_input_tokens + other.cache_creation_input_tokens,
        )


@dataclass(frozen=True)
class Suggestions:
    candidates: Sequence[ClipCandidate]
    usage: TokenUsage


class ClipSuggestionError(Exception):
    """LLM gagal memberi usulan; pesannya ditampilkan apa adanya ke pengguna."""


class ClipSuggester(Protocol):
    def suggest(self, request: SuggestionRequest) -> Suggestions:
        """Kandidat klip dari satu jendela transkrip. Gagal → `ClipSuggestionError`."""
        ...


class ClipFocusReader(Protocol):
    def clip_focus(self, project_id: str) -> str | None:
        """Fokus klip yang diisi pengguna untuk proyek ini; `None` bila tidak ada."""
        ...


class ProxyReadiness(Protocol):
    def proxy_ready(self, source_id: str) -> bool:
        """Proxy video sumber sudah jadi (analisis wajah `reframe` baru bisa jalan)."""
        ...


@dataclass(frozen=True)
class EditedClip:
    """Klip tersimpan yang sudah punya EditingScript; dipertahankan saat discover ulang."""

    id: str
    clip: DiscoveredClip


@dataclass(frozen=True)
class KeptClip:
    id: str
    ranked: RankedClip


class ClipRepository(Protocol):
    def edited_for_source(self, project_id: str, source_id: str) -> list[EditedClip]:
        """Klip dari video `source_id` yang sudah diedit pengguna."""
        ...

    def replace_for_source(
        self,
        project_id: str,
        source_id: str,
        new: Sequence[RankedClip],
        kept: Sequence[KeptClip],
    ) -> list[str]:
        """Dalam satu transaksi: hapus klip `source_id` yang tidak ada di `kept`, perbarui
        skor & peringkat `kept`, sisipkan `new`. Mengembalikan id klip baru sesuai urutan
        `new`."""
        ...
