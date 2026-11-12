import type { CropTracks } from "@/shared/schemas";

/** Baris `clip_reframes` yang dipakai web. */
export interface StoredClipReframe {
  /** Rentang klip saat dianalisis. */
  startMs: number;
  endMs: number;
  /** `null` = crop belum dihitung (baris lama) atau tidak valid. */
  crops: CropTracks | null;
}

export interface ClipReframeRepository {
  findByClipId(clipId: string): Promise<StoredClipReframe | null>;
}
