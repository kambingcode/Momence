"""Model payload job; cermin dari web/src/shared/schemas/jobs.ts."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class IngestPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, frozen=True)

    source_id: str = Field(min_length=1, alias="sourceId")
    # Audio sudah diambil job `download-audio` (dan `transcribe` sudah diantre olehnya): ingest
    # hanya membuat proxy & thumbnail.
    audio_ready: bool = Field(default=False, alias="audioReady")


class TranscribePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, frozen=True)

    source_id: str = Field(min_length=1, alias="sourceId")


class DownloadPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, frozen=True)

    source_id: str = Field(min_length=1, alias="sourceId")
    url: str = Field(min_length=1)
    # Impor dari link: audio diunduh lebih dulu oleh job `download-audio`; ingest tidak perlu
    # mengekstrak audio lagi.
    audio_first: bool = Field(default=False, alias="audioFirst")
    # Sisi terpendek maksimum unduhan; None = bawaan (1080). Pilihan pengguna saat impor link.
    max_resolution: Literal[720, 1080] | None = Field(default=None, alias="maxResolution")


class DownloadAudioPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, frozen=True)

    source_id: str = Field(min_length=1, alias="sourceId")
    url: str = Field(min_length=1)
