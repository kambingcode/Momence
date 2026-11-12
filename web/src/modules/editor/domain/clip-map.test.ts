import { describe, expect, it } from "vitest";
import type { EditorToken } from "./clip-tokens";
import {
  layoutClipMap,
  layoutTextLanes,
  percentOf,
  rulerTicks,
  sourceMinimap,
  sourceMsAtPercent,
} from "./clip-map";
import { buildTimeline } from "./timeline";

const range = { startMs: 10_000, endMs: 20_000 };
const token = (
  id: string,
  type: EditorToken["type"],
  startMs: number,
  endMs: number,
): EditorToken => ({ id, type, text: id, startMs, endMs });

const tokens = [
  token("a", "word", 10_000, 11_000),
  token("p", "pause", 11_000, 12_000),
  token("f", "filler", 12_000, 13_000),
  token("b", "word", 13_000, 14_000),
];

const layout = (
  removed: string[],
  broll = [] as { startMs: number; endMs: number }[],
) =>
  layoutClipMap({
    tokens,
    timeline: buildTimeline(tokens, new Set(removed), range),
    range,
    broll,
  });

describe("percentOf & sourceMsAtPercent", () => {
  it("memetakan waktu sumber ke persen & sebaliknya (dijepit)", () => {
    expect(percentOf(range, 15_000)).toBe(50);
    expect(percentOf(range, 0)).toBe(0);
    expect(percentOf(range, 99_000)).toBe(100);
    expect(sourceMsAtPercent(range, 25)).toBe(12_500);
    expect(sourceMsAtPercent(range, 150)).toBe(20_000);
  });

  it("klip kosong → 0", () => {
    expect(percentOf({ startMs: 5, endMs: 5 }, 5)).toBe(0);
  });
});

describe("layoutClipMap", () => {
  it("tanpa potongan: setiap token jadi blok menurut jenisnya", () => {
    const result = layout([]);
    expect(result.cuts).toEqual([]);
    expect(result.durationMs).toBe(10_000);
    expect(result.tokens.map((t) => t.kind)).toEqual([
      "word",
      "pause",
      "filler",
      "word",
    ]);
    expect(result.tokens[1]).toEqual({
      kind: "pause",
      leftPct: 10,
      widthPct: 10,
    });
  });

  it("token terpotong digambar sebagai arsiran, bukan blok token", () => {
    const result = layout(["f"]);
    expect(result.tokens.map((t) => t.kind)).toEqual(["word", "pause", "word"]);
    expect(result.cuts).toHaveLength(1);
    expect(result.cuts[0]!.leftPct).toBeCloseTo(20);
  });

  it("potongan di akhir klip menyapu sampai tepi klip", () => {
    const result = layout(["b"]);
    const cut = result.cuts.at(-1)!;
    expect(cut.leftPct + cut.widthPct).toBeCloseTo(100);
  });

  it("B-roll dijepit ke klip; yang di luar klip diabaikan", () => {
    const result = layout(
      [],
      [
        { startMs: 18_000, endMs: 25_000 },
        { startMs: 30_000, endMs: 31_000 },
      ],
    );
    expect(result.broll).toEqual([{ leftPct: 80, widthPct: 20 }]);
  });

  it("semua terpotong → satu arsiran penuh, tanpa token", () => {
    const result = layout(["a", "p", "f", "b"]);
    expect(result.tokens).toEqual([]);
    expect(result.cuts).toEqual([{ leftPct: 0, widthPct: 100 }]);
  });

  it("klip tanpa token → peta kosong tetapi sumbu tetap", () => {
    const empty = layoutClipMap({
      tokens: [],
      timeline: buildTimeline([], new Set(), range),
      range,
      broll: [],
    });
    expect(empty.tokens).toEqual([]);
    expect(empty.cuts).toEqual([]);
    expect(empty.ticks.length).toBeGreaterThan(0);
  });
});

describe("rulerTicks", () => {
  it("memilih langkah agar tanda ≤ batas", () => {
    expect(rulerTicks(59_000).map((t) => t.ms / 1000)).toEqual([
      0, 10, 20, 30, 40, 50,
    ]);
    expect(rulerTicks(10_000).map((t) => t.ms / 1000)).toEqual([0, 2, 4, 6, 8]);
  });

  it("durasi 0 → tanpa tanda", () => {
    expect(rulerTicks(0)).toEqual([]);
  });
});

describe("sourceMinimap", () => {
  it("posisi klip di video sumber", () => {
    const result = sourceMinimap(range, 100_000)!;
    expect(result.leftPct).toBe(10);
    expect(result.widthPct).toBe(10);
    expect(result.totalMs).toBe(100_000);
  });

  it("durasi sumber tak diketahui → null", () => {
    expect(sourceMinimap(range, null)).toBeNull();
    expect(sourceMinimap(range, 0)).toBeNull();
  });
});

describe("layoutTextLanes", () => {
  const text = (id: string, startMs: number, endMs: number) => ({
    id,
    startMs,
    endMs,
  });
  const lanes = (texts: ReturnType<typeof text>[], removed: string[] = []) =>
    layoutTextLanes({
      range,
      timeline: buildTimeline(tokens, new Set(removed), range),
      texts,
    });

  it("satu teks → satu batang di lajur 0 (persen klip asli)", () => {
    expect(lanes([text("t1", 12_000, 15_000)])).toEqual({
      bars: [{ id: "t1", lane: 0, shown: true, leftPct: 20, widthPct: 30 }],
      lanes: 1,
    });
  });

  it("teks bertumpuk → lajur berbeda; lajur kosong dipakai ulang", () => {
    const result = lanes([
      text("a", 10_000, 14_000),
      text("b", 12_000, 16_000),
      text("c", 14_000, 18_000),
      text("d", 15_000, 17_000),
    ]);
    expect(result.bars.map((b) => [b.id, b.lane])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 0],
      ["d", 2],
    ]);
    expect(result.lanes).toBe(3);
  });

  it("dijepit ke klip; di luar klip tidak digambar", () => {
    const result = lanes([
      text("tepi", 8_000, 11_000),
      text("luar", 21_000, 22_000),
    ]);
    expect(result.bars).toEqual([
      { id: "tepi", lane: 0, shown: true, leftPct: 0, widthPct: 10 },
    ]);
    expect(result.lanes).toBe(1);
  });

  it("teks di bagian terpotong tetap digambar, ditandai tidak tampil", () => {
    // "f" (12–13 dtk) dipotong; teks 12,2–12,8 dtk seluruhnya di dalamnya.
    const result = lanes(
      [text("hilang", 12_200, 12_800), text("ada", 12_200, 13_500)],
      ["f"],
    );
    expect(result.bars.map((b) => [b.id, b.shown])).toEqual([
      ["hilang", false],
      ["ada", true],
    ]);
  });

  it("tanpa teks → tanpa lajur", () => {
    expect(lanes([])).toEqual({ bars: [], lanes: 0 });
  });
});
