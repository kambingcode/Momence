"""Model payload job; cermin dari web/src/shared/schemas/jobs.ts."""

from pydantic import BaseModel, ConfigDict, Field


class NoopPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, frozen=True)

    duration_ms: int = Field(default=2000, ge=0, le=60_000, alias="durationMs")
