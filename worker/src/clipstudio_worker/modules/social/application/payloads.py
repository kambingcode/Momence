"""Model payload job post-copy; cermin dari web/src/shared/schemas/jobs.ts."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PostCopyPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, frozen=True)

    clip_id: str = Field(min_length=1, alias="clipId")
    title: str
    hook: str = ""
    platform: Literal["tiktok", "reels", "shorts"]
    # `None` = bahasa yang sama dengan transkrip.
    language: Literal["id", "en"] | None = None
    transcript: str
