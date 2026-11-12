"""Model payload job render; cermin dari web/src/shared/schemas/jobs.ts."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RenderPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, frozen=True)

    clip_id: str = Field(min_length=1, alias="clipId")
    # Video sumber resolusi penuh, relatif terhadap direktori data.
    source_path: str = Field(min_length=1, alias="sourcePath")
    # Props komposisi Remotion (dibuat web), diteruskan apa adanya ke renderer.
    props: dict[str, Any]
