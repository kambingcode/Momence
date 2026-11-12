import { describe, expect, it } from "vitest";
import type { CleanupToken } from "./cleanup";
import { detectPauses } from "./pauses";

const tokens: CleanupToken[] = [
  { id: "p1", type: "pause", text: "", startMs: 0, endMs: 300 },
  { id: "w1", type: "word", text: "halo", startMs: 300, endMs: 600 },
  { id: "p2", type: "pause", text: "", startMs: 600, endMs: 1100 },
  { id: "w2", type: "word", text: "semua", startMs: 1100, endMs: 1500 },
  { id: "p3", type: "pause", text: "", startMs: 1500, endMs: 3500 },
];

describe("detectPauses", () => {
  it("hanya jeda ≥ ambang (inklusif), satu temuan per jeda", () => {
    expect(detectPauses(tokens, 500)).toEqual([
      { kind: "pause", tokenIds: ["p2"], startMs: 600, endMs: 1100, key: "" },
      { kind: "pause", tokenIds: ["p3"], startMs: 1500, endMs: 3500, key: "" },
    ]);
    expect(detectPauses(tokens, 300).map((m) => m.tokenIds[0])).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
    expect(detectPauses(tokens, 2001)).toEqual([]);
  });
});
