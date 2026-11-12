import type { CropTracks } from "@/shared/schemas";
import type { ClipReframeRepository } from "./ports";

export interface ClipRange {
  id: string;
  startMs: number;
  endMs: number;
}

/**
 * Jalur crop auto-reframe klip per rasio. Belum dianalisis, crop belum dihitung, atau rentang
 * klip berbeda dari saat dianalisis → `null` (pratinjau & render memakai crop tengah).
 */
export class GetClipCropTracks {
  constructor(private readonly reframes: ClipReframeRepository) {}

  async execute(clip: ClipRange): Promise<CropTracks | null> {
    const stored = await this.reframes.findByClipId(clip.id);
    if (
      !stored ||
      stored.startMs !== clip.startMs ||
      stored.endMs !== clip.endMs
    )
      return null;
    return stored.crops;
  }
}
