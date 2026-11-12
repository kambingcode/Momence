import { describe, expect, it } from "vitest";
import { importVideoRequestSchema } from "./jobs";

describe("importVideoRequestSchema", () => {
  const url = "https://www.twitch.tv/videos/1";

  it("kualitas opsional: tanpa nilai, 720, dan 1080 diterima", () => {
    for (const maxResolution of [undefined, 720, 1080]) {
      const parsed = importVideoRequestSchema.safeParse({ url, maxResolution });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.maxResolution).toBe(maxResolution);
    }
  });

  it("menolak kualitas lain", () => {
    for (const maxResolution of [480, 2160, "720", 0, null])
      expect(
        importVideoRequestSchema.safeParse({ url, maxResolution }).success,
      ).toBe(false);
  });
});
