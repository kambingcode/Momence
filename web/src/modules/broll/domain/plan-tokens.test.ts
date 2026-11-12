import { describe, expect, it } from "vitest";
import {
  brollPlanTokens,
  hasSpeech,
  type PlanToken,
  visibleMs,
} from "./plan-tokens";

const tokens: PlanToken[] = [
  { id: "w1", type: "word", text: "Halo", startMs: 0, endMs: 400 },
  { id: "w2", type: "filler", text: "eh", startMs: 400, endMs: 700 },
  { id: "p1", type: "pause", text: "", startMs: 700, endMs: 2_500 },
  { id: "w3", type: "word", text: "nabung.", startMs: 2_500, endMs: 3_000 },
];

describe("brollPlanTokens", () => {
  it("membuang token terhapus & memakai teks koreksi", () => {
    expect(
      brollPlanTokens(tokens, new Set(["w2"]), { w3: "menabung." }),
    ).toEqual([tokens[0], tokens[2], { ...tokens[3], text: "menabung." }]);
  });

  it("hasSpeech: hanya jeda / teks kosong → tidak ada ucapan", () => {
    expect(hasSpeech(tokens)).toBe(true);
    expect(
      hasSpeech(brollPlanTokens(tokens, new Set(["w1", "w2", "w3"]), {})),
    ).toBe(false);
    expect(hasSpeech([{ ...tokens[0]!, text: "  " }])).toBe(false);
  });
});

describe("visibleMs", () => {
  const segments = [
    { startMs: 0, endMs: 1_000 },
    { startMs: 3_000, endMs: 5_000 },
  ];

  it("menjumlahkan bagian rentang yang masih diputar", () => {
    expect(visibleMs(segments, { startMs: 500, endMs: 4_000 })).toBe(1_500);
    expect(visibleMs(segments, { startMs: 1_000, endMs: 3_000 })).toBe(0);
    expect(visibleMs([], { startMs: 0, endMs: 1_000 })).toBe(0);
  });
});
