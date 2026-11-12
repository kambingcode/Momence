"""Model payload job; cermin dari web/src/shared/schemas/jobs.ts."""

from pydantic import BaseModel, ConfigDict, Field


class DiscoverPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, frozen=True)

    source_id: str = Field(min_length=1, alias="sourceId")
