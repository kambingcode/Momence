import { describe, expect, it } from "vitest";
import { subscoreTier } from "./score";

describe("subscoreTier", () => {
  it.each([
    [0, "C"],
    [4, "C"],
    [5, "B"],
    [6, "B"],
    [7, "A-"],
    [8, "A-"],
    [9, "A"],
    [10, "A"],
  ] as const)("skor %i → %s", (score, tier) => {
    expect(subscoreTier(score)).toBe(tier);
  });
});
