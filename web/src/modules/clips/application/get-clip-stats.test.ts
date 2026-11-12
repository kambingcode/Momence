import { describe, expect, it } from "vitest";
import { GetClipStats } from "./get-clip-stats";

describe("GetClipStats", () => {
  it("mengubah rawScore terbaik menjadi skor 0–100 per proyek", async () => {
    let askedFor: readonly string[] = [];
    const stats = new GetClipStats({
      summarizeByProject: async (ids) => {
        askedFor = ids;
        return new Map([
          ["a", { count: 11, bestRawScore: 8.9 }],
          ["b", { count: 2, bestRawScore: null }],
        ]);
      },
    });

    const result = await stats.execute(["a", "b", "c"]);
    expect(askedFor).toEqual(["a", "b", "c"]);
    expect(result).toEqual(
      new Map([
        ["a", { count: 11, bestScore: 89 }],
        ["b", { count: 2, bestScore: null }],
      ]),
    );
  });
});
