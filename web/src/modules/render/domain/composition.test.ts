import { describe, expect, it } from "vitest";
import {
  compositionPlan,
  frameAtOrAfter,
  frameToSourceMs,
  sourceMsToFrame,
} from "./composition";

// 30 fps: 1 frame = 33,3 ms.
const plan = compositionPlan([
  { startMs: 1000, endMs: 2000 }, // frame sumber 30–60
  { startMs: 3000, endMs: 3500 }, // 90–105
  { startMs: 5000, endMs: 5010 }, // < ½ frame → hilang
]);

describe("compositionPlan", () => {
  it("bagian sumber bersambung tanpa celah di komposisi", () => {
    expect(plan).toEqual({
      fps: 30,
      durationInFrames: 45,
      sequences: [
        { fromFrame: 0, durationInFrames: 30, sourceStartFrame: 30 },
        { fromFrame: 30, durationInFrames: 15, sourceStartFrame: 90 },
      ],
    });
  });

  it("durasi total = durasi timeline ± ½ frame, galat tidak menumpuk; tanpa celah", () => {
    // 50 bagian 50 ms: dibulatkan per bagian (2 frame) akan menjadi 100 frame, bukan 75.
    const segments = Array.from({ length: 50 }, (_, i) => ({
      startMs: i * 100,
      endMs: i * 100 + 50,
    }));
    const result = compositionPlan(segments);
    expect(result.durationInFrames).toBe(75);
    result.sequences.forEach((s, i) => {
      const next = result.sequences[i + 1];
      if (next) expect(next.fromFrame).toBe(s.fromFrame + s.durationInFrames);
    });
    const last = result.sequences.at(-1)!;
    expect(last.fromFrame + last.durationInFrames).toBe(75);
  });

  it("tanpa bagian → komposisi kosong", () => {
    expect(compositionPlan([])).toEqual({
      fps: 30,
      durationInFrames: 0,
      sequences: [],
    });
  });
});

describe("pemetaan frame ↔ sumber", () => {
  it("frame komposisi → ms sumber", () => {
    expect(frameToSourceMs(plan, 0)).toBe(1000);
    expect(frameToSourceMs(plan, 29)).toBeCloseTo(1966.67, 1);
    expect(frameToSourceMs(plan, 30)).toBe(3000);
    expect(frameToSourceMs(plan, 45)).toBeNull();
  });

  it("ms sumber → frame komposisi; potongan → awal bagian berikutnya", () => {
    expect(sourceMsToFrame(plan, 0)).toBe(0);
    expect(sourceMsToFrame(plan, 1500)).toBe(15);
    expect(sourceMsToFrame(plan, 2500)).toBe(30);
    expect(sourceMsToFrame(plan, 3001)).toBe(30);
    expect(sourceMsToFrame(plan, 9000)).toBe(44);
    expect(sourceMsToFrame(compositionPlan([]), 100)).toBe(0);
  });

  it("frameAtOrAfter tidak pernah mendahului posisi", () => {
    expect(frameAtOrAfter(plan, 1000)).toBe(0);
    expect(frameAtOrAfter(plan, 1001)).toBe(1);
    expect(frameAtOrAfter(plan, 1033.4)).toBe(2);
    expect(frameAtOrAfter(plan, 1990)).toBe(30); // sisa bagian < 1 frame → bagian berikutnya
  });

  it("bolak-balik di dalam bagian tetap di frame yang sama", () => {
    for (const frame of [0, 7, 29, 30, 44]) {
      expect(sourceMsToFrame(plan, frameToSourceMs(plan, frame)!)).toBe(frame);
    }
  });
});
