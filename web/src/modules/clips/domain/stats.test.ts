import { describe, expect, it } from "vitest";
import { bestClipScore } from "./stats";

describe("bestClipScore", () => {
  it("rawScore × 10, dibulatkan setengah ke atas", () => {
    expect(bestClipScore(8.9)).toBe(89);
    expect(bestClipScore(7.75)).toBe(78);
    expect(bestClipScore(7)).toBe(70);
    expect(bestClipScore(0)).toBe(0);
    expect(bestClipScore(10)).toBe(100);
  });

  it("dibatasi 0–100", () => {
    expect(bestClipScore(12)).toBe(100);
    expect(bestClipScore(-1)).toBe(0);
  });

  it("null bila tidak ada skor", () => {
    expect(bestClipScore(null)).toBeNull();
    expect(bestClipScore(Number.NaN)).toBeNull();
  });
});
