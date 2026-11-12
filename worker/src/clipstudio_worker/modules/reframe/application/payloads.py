"""Model payload job reframe; cermin dari web/src/shared/schemas/jobs.ts."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class ReframePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, frozen=True)

    clip_ids: list[Annotated[str, Field(min_length=1)]] = Field(min_length=1, alias="clipIds")
