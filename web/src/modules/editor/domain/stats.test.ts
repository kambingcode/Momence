import { describe, expect, it } from "vitest";
import { cutSummary, transcriptStats } from "./stats";

const tokens = [
  { id: "w1", type: "word" },
  { id: "p1", type: "pause" },
  { id: "w2", type: "filler" },
  { id: "w3", type: "word" },
] as const;

describe("transcriptStats", () => {
  it("menghitung kata & filler, bukan jeda", () => {
    expect(transcriptStats(tokens, new Set())).toEqual({
      words: 3,
      removedWords: 0,
    });
  });

  it("menghitung kata terpotong tanpa jeda yang terpotong", () => {
    expect(transcriptStats(tokens, new Set(["w2", "p1", "w3"]))).toEqual({
      words: 3,
      removedWords: 2,
    });
  });

  it("transkrip kosong → nol", () => {
    expect(transcriptStats([], new Set(["x"]))).toEqual({
      words: 0,
      removedWords: 0,
    });
  });
});

describe("cutSummary", () => {
  it("menghitung kata (bukan jeda) dan rentang waktu dari token pertama ke terakhir", () => {
    expect(
      cutSummary([
        { type: "word", startMs: 1000, endMs: 1300 },
        { type: "pause", startMs: 1300, endMs: 1700 },
        { type: "filler", startMs: 1700, endMs: 2300 },
      ]),
    ).toEqual({ words: 2, durationMs: 1300 });
  });

  it("kosong → nol", () => {
    expect(cutSummary([])).toEqual({ words: 0, durationMs: 0 });
  });
});
