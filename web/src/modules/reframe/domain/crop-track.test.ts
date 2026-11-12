import { describe, expect, it } from "vitest";
import { type CropKeyframe, cropAt, videoBoxForCrop } from "./crop-track";

const key = (tMs: number, x: number): CropKeyframe => ({
  tMs,
  cropRect: { x, y: 0, width: 0.3164, height: 1 },
});

describe("cropAt", () => {
  const track = [
    key(1_000, 0.1),
    key(2_000, 0.3),
    key(4_999, 0.3),
    key(5_000, 0.6),
  ];

  it("menginterpolasi linear di antara keyframe", () => {
    expect(cropAt(track, 1_500)?.x).toBeCloseTo(0.2);
    expect(cropAt(track, 3_000)?.x).toBeCloseTo(0.3);
  });

  it("melompat di batas adegan (keyframe 1 ms terpisah)", () => {
    expect(cropAt(track, 4_999)?.x).toBeCloseTo(0.3);
    expect(cropAt(track, 5_000)?.x).toBeCloseTo(0.6);
  });

  it("menahan posisi di luar rentang keyframe", () => {
    expect(cropAt(track, 0)?.x).toBe(0.1);
    expect(cropAt(track, 9_000)?.x).toBe(0.6);
    expect(cropAt([key(1_000, 0.4)], 5_000)?.x).toBe(0.4);
  });

  it("tanpa keyframe → null", () => {
    expect(cropAt([], 1_000)).toBeNull();
  });
});

describe("videoBoxForCrop", () => {
  it("memperbesar & menggeser video agar crop memenuhi komposisi", () => {
    const box = videoBoxForCrop({ x: 0.25, y: 0, width: 0.5, height: 1 });
    expect(box).toEqual({ left: -50, top: -0, width: 200, height: 100 });
  });

  it("crop vertikal (sumber potret ke 16:9)", () => {
    const box = videoBoxForCrop({ x: 0, y: 0.2, width: 1, height: 0.4 });
    expect(box.left).toBeCloseTo(0);
    expect(box.top).toBeCloseTo(-50);
    expect(box.height).toBeCloseTo(250);
  });
});
