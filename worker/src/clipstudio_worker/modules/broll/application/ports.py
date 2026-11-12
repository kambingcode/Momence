"""Port modul broll."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from clipstudio_worker.modules.broll.domain.slots import SlotCandidate, SpokenSentence
from clipstudio_worker.modules.clips.application import TokenUsage


@dataclass(frozen=True)
class BrollPlanRequest:
    title: str
    # Kalimat klip bernomor mulai 1; waktu dalam ms video sumber.
    sentences: Sequence[SpokenSentence]
    clip_start_ms: int


@dataclass(frozen=True)
class PlannedSlots:
    candidates: Sequence[SlotCandidate]
    usage: TokenUsage


class BrollPlanError(Exception):
    """LLM gagal memberi rencana; pesannya ditampilkan apa adanya ke pengguna."""


class BrollPlanner(Protocol):
    def plan(self, request: BrollPlanRequest) -> PlannedSlots:
        """Usulan slot B-roll untuk satu klip. Gagal → `BrollPlanError`."""
        ...
