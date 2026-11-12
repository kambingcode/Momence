"""API publik modul clips. Modul lain & presentation hanya import dari paket ini."""

from clipstudio_worker.modules.clips.application.discover import DiscoverClipsJob
from clipstudio_worker.modules.clips.application.ports import (
    ClipFocusReader,
    ClipRepository,
    ClipSuggester,
    ClipSuggestionError,
    EditedClip,
    KeptClip,
    ProxyReadiness,
    SuggestionRequest,
    Suggestions,
    TokenUsage,
)
from clipstudio_worker.modules.clips.domain.clip import (
    SUBSCORE_NAMES,
    ClipCandidate,
    DiscoveredClip,
    Subscore,
    SubscoreName,
)
from clipstudio_worker.modules.clips.domain.scoring import RankedClip
from clipstudio_worker.modules.clips.domain.sentences import Sentence, split_sentences

__all__ = [
    "SUBSCORE_NAMES",
    "ClipCandidate",
    "ClipFocusReader",
    "ClipRepository",
    "ClipSuggester",
    "ClipSuggestionError",
    "DiscoverClipsJob",
    "DiscoveredClip",
    "EditedClip",
    "KeptClip",
    "ProxyReadiness",
    "RankedClip",
    "Sentence",
    "Subscore",
    "SubscoreName",
    "SuggestionRequest",
    "Suggestions",
    "TokenUsage",
    "split_sentences",
]
