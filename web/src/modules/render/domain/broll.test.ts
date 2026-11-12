import { describe, expect, it } from "vitest";
import { type BrollSource, brollSequences } from "./broll";
import { compositionPlan } from "./composition";

const stock = (
  startMs: number,
  endMs: number,
  durationMs = 10_000,
  name = "a",
): BrollSource => ({
  startMs,
  endMs,
  durationMs,
  url: `https://videos.example/${name}-hd.mp4`,
  previewUrl: `https://videos.example/${name}-sd.mp4`,
});

describe("brollSequences", () => {
  it("rentang di klip utuh → satu sequence di frame komposisi", () => {
    // Klip 10–20 dtk sumber; B-roll 12–15 dtk → frame 60–150 komposisi (30 fps).
    const plan = compositionPlan([{ startMs: 10_000, endMs: 20_000 }]);
    expect(brollSequences(plan, [stock(12_000, 15_000)])).toEqual([
      {
        fromFrame: 60,
        durationInFrames: 90,
        trimBeforeFrames: 0,
        url: "https://videos.example/a-hd.mp4",
        previewUrl: "https://videos.example/a-sd.mp4",
      },
    ]);
  });

  it("bagian terpotong dilewati; video stok berlanjut & digabung di sambungan", () => {
    // Dipotong 13–14 dtk: B-roll 12–16 dtk tampil 12–13 lalu 14–16 (bersambung di komposisi).
    const plan = compositionPlan([
      { startMs: 10_000, endMs: 13_000 },
      { startMs: 14_000, endMs: 20_000 },
    ]);
    expect(
      brollSequences(plan, [stock(12_000, 16_000)]).map((s) => [
        s.fromFrame,
        s.durationInFrames,
        s.trimBeforeFrames,
      ]),
    ).toEqual([[60, 90, 0]]);
  });

  it("video stok pendek diputar ulang dari awal", () => {
    const plan = compositionPlan([{ startMs: 0, endMs: 10_000 }]);
    expect(
      brollSequences(plan, [stock(1_000, 6_000, 2_000)]).map((s) => [
        s.fromFrame,
        s.durationInFrames,
        s.trimBeforeFrames,
      ]),
    ).toEqual([
      [30, 60, 0],
      [90, 60, 0],
      [150, 30, 0],
    ]);
    // Durasi tidak diketahui → tidak dipecah.
    expect(brollSequences(plan, [stock(1_000, 6_000, 0)])).toHaveLength(1);
  });

  it("B-roll di bagian terhapus / di luar klip tidak tampil; urut menurut waktu", () => {
    const plan = compositionPlan([
      { startMs: 0, endMs: 5_000 },
      { startMs: 8_000, endMs: 12_000 },
    ]);
    const sequences = brollSequences(plan, [
      stock(9_000, 11_000, 10_000, "b"),
      stock(5_500, 7_500, 10_000, "hilang"),
      stock(1_000, 2_000, 10_000, "a"),
      stock(20_000, 22_000, 10_000, "luar"),
    ]);
    expect(
      sequences.map((s) => [s.url.split("/").at(-1), s.fromFrame]),
    ).toEqual([
      ["a-hd.mp4", 30],
      ["b-hd.mp4", 180],
    ]);
  });

  it("dua B-roll bersebelahan dengan video sama tidak digabung", () => {
    const plan = compositionPlan([{ startMs: 0, endMs: 10_000 }]);
    expect(
      brollSequences(plan, [stock(1_000, 2_000), stock(2_000, 3_000)]).map(
        (s) => [s.fromFrame, s.trimBeforeFrames],
      ),
    ).toEqual([
      [30, 0],
      [60, 0],
    ]);
  });
});
