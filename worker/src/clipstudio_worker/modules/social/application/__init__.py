"""API publik modul social. Modul lain & presentation hanya import dari paket ini."""

from clipstudio_worker.modules.social.application.payloads import PostCopyPayload
from clipstudio_worker.modules.social.application.ports import (
    DraftPostCopy,
    PostCopyError,
    PostCopyRequest,
    PostCopyWriter,
)
from clipstudio_worker.modules.social.application.write import WritePostCopyJob
from clipstudio_worker.modules.social.domain.copy import (
    MAX_CAPTION_CHARS,
    MAX_HASHTAG_CHARS,
    MAX_HASHTAGS,
    PLATFORMS,
    Platform,
    PostCopy,
    build_post_copy,
    clean_caption,
    clean_hashtags,
    normalize_hashtag,
)

__all__ = [
    "MAX_CAPTION_CHARS",
    "MAX_HASHTAGS",
    "MAX_HASHTAG_CHARS",
    "PLATFORMS",
    "DraftPostCopy",
    "Platform",
    "PostCopy",
    "PostCopyError",
    "PostCopyPayload",
    "PostCopyRequest",
    "PostCopyWriter",
    "WritePostCopyJob",
    "build_post_copy",
    "clean_caption",
    "clean_hashtags",
    "normalize_hashtag",
]
