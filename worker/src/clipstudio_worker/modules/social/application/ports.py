"""Port modul social."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from clipstudio_worker.modules.clips.application import TokenUsage
from clipstudio_worker.modules.social.domain.copy import Platform


@dataclass(frozen=True)
class PostCopyRequest:
    title: str
    hook: str
    # Ucapan klip apa adanya (tanpa jeda), satu paragraf.
    transcript: str
    platform: Platform
    # `None` = bahasa yang sama dengan transkrip.
    language: str | None


@dataclass(frozen=True)
class DraftPostCopy:
    """Tulisan mentah Gemini; belum dirapikan aturan domain."""

    caption: str
    alt_caption: str
    hashtags: Sequence[str]
    usage: TokenUsage


class PostCopyError(Exception):
    """LLM gagal menulis caption; pesannya ditampilkan apa adanya ke pengguna."""


class PostCopyWriter(Protocol):
    def write(self, request: PostCopyRequest) -> DraftPostCopy:
        """Caption + hashtag untuk satu klip. Gagal → `PostCopyError`."""
        ...
