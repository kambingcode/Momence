import { describe, expect, it } from "vitest";
import type { CropTracks } from "@/shared/schemas";
import { GetClipCropTracks } from "./get-clip-crop-tracks";
import type { ClipReframeRepository, StoredClipReframe } from "./ports";

const crops: CropTracks = {
  "9:16": [
    { tMs: 1_000, cropRect: { x: 0.2, y: 0, width: 0.3164, height: 1 } },
  ],
  "1:1": [],
  "16:9": [],
};

const repository = (
  rows: Record<string, StoredClipReframe>,
): ClipReframeRepository => ({
  findByClipId: async (clipId) => rows[clipId] ?? null,
});

describe("GetClipCropTracks", () => {
  const clip = { id: "c1", startMs: 1_000, endMs: 31_000 };

  it("mengembalikan crop yang dianalisis untuk rentang klip ini", async () => {
    const tracks = new GetClipCropTracks(
      repository({ c1: { startMs: 1_000, endMs: 31_000, crops } }),
    );
    expect(await tracks.execute(clip)).toEqual(crops);
  });

  it("belum dianalisis, crop belum dihitung, atau rentang berubah → null", async () => {
    const tracks = new GetClipCropTracks(
      repository({
        c2: { startMs: 1_000, endMs: 31_000, crops: null },
        c3: { startMs: 1_000, endMs: 30_000, crops },
      }),
    );
    expect(await tracks.execute(clip)).toBeNull();
    expect(await tracks.execute({ ...clip, id: "c2" })).toBeNull();
    expect(await tracks.execute({ ...clip, id: "c3" })).toBeNull();
  });
});
