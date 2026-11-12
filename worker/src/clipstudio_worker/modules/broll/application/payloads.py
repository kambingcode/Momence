"""Model payload job broll-plan; cermin dari web/src/shared/schemas/jobs.ts."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class BrollPlanToken(BaseModel):
    model_config = ConfigDict(populate_by_name=True, frozen=True)

    id: str = Field(min_length=1)
    type: Literal["word", "filler", "pause"]
    # Teks setelah koreksi pengguna.
    text: str
    start_ms: int = Field(ge=0, alias="startMs")
    end_ms: int = Field(ge=0, alias="endMs")


class BrollPlanPayload(BaseModel):
    """Token klip yang dipertahankan editor (bagian terhapus tidak ikut), dibuat web."""

    model_config = ConfigDict(populate_by_name=True, frozen=True)

    clip_id: str = Field(min_length=1, alias="clipId")
    title: str
    tokens: list[BrollPlanToken]
