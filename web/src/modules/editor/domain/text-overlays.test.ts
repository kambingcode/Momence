import { describe, expect, it } from "vitest";
import {
  clampTextPosition,
  clampTextRange,
  defaultTextRange,
  dragTextPosition,
  moveInStack,
  TEXT_MIN_DURATION_MS,
  textRangeAfterDrag,
} from "./text-overlays";

const clip = { startMs: 10_000, endMs: 20_000 };

describe("defaultTextRange", () => {
  it("3 dtk mulai posisi pratinjau, digeser mundur di akhir klip", () => {
    expect(defaultTextRange(12_345.6, clip)).toEqual({
      startMs: 12_346,
      endMs: 15_346,
    });
    expect(defaultTextRange(19_000, clip)).toEqual({
      startMs: 17_000,
      endMs: 20_000,
    });
    expect(defaultTextRange(0, clip)).toEqual({
      startMs: 10_000,
      endMs: 13_000,
    });
  });

  it("klip lebih pendek dari 3 dtk → seluruh klip", () => {
    expect(defaultTextRange(1_500, { startMs: 1_000, endMs: 2_000 })).toEqual({
      startMs: 1_000,
      endMs: 2_000,
    });
  });
});

describe("clampTextRange", () => {
  it("move: durasi tetap, dijepit di dalam klip", () => {
    expect(
      clampTextRange({ startMs: 8_000, endMs: 11_000 }, clip, "move"),
    ).toEqual({ startMs: 10_000, endMs: 13_000 });
    expect(
      clampTextRange({ startMs: 18_500, endMs: 21_500 }, clip, "move"),
    ).toEqual({ startMs: 17_000, endMs: 20_000 });
    // Nilai pecahan dari seretan: tetap di dalam klip setelah dibulatkan.
    expect(
      clampTextRange({ startMs: 16_999.6, endMs: 19_999.7 }, clip, "move"),
    ).toEqual({ startMs: 17_000, endMs: 20_000 });
    // Lebih panjang dari klip → seluruh klip.
    expect(
      clampTextRange({ startMs: 5_000, endMs: 25_000 }, clip, "move"),
    ).toEqual(clip);
  });

  it("start: tepi kanan tetap, durasi minimum dijaga", () => {
    expect(
      clampTextRange({ startMs: 14_900, endMs: 15_000 }, clip, "start"),
    ).toEqual({ startMs: 15_000 - TEXT_MIN_DURATION_MS, endMs: 15_000 });
    expect(
      clampTextRange({ startMs: 2_000, endMs: 15_000 }, clip, "start"),
    ).toEqual({ startMs: 10_000, endMs: 15_000 });
    expect(
      clampTextRange({ startMs: 12_000.4, endMs: 15_000 }, clip, "start"),
    ).toEqual({ startMs: 12_000, endMs: 15_000 });
  });

  it("end: tepi kiri tetap, durasi minimum dijaga", () => {
    expect(
      clampTextRange({ startMs: 12_000, endMs: 12_100 }, clip, "end"),
    ).toEqual({ startMs: 12_000, endMs: 12_000 + TEXT_MIN_DURATION_MS });
    expect(
      clampTextRange({ startMs: 12_000, endMs: 30_000 }, clip, "end"),
    ).toEqual({ startMs: 12_000, endMs: 20_000 });
    // Tepi kiri yang terlalu dekat akhir klip ikut dijepit.
    expect(
      clampTextRange({ startMs: 19_900, endMs: 19_950 }, clip, "end"),
    ).toEqual({ startMs: 19_500, endMs: 20_000 });
  });

  it("klip lebih pendek dari durasi minimum → seluruh klip", () => {
    const tiny = { startMs: 1_000, endMs: 1_300 };
    for (const edit of ["move", "start", "end"] as const)
      expect(
        clampTextRange({ startMs: 1_100, endMs: 1_150 }, tiny, edit),
      ).toEqual(tiny);
  });
});

describe("clampTextPosition", () => {
  it("0–100, dibulatkan ke 0,1", () => {
    expect(clampTextPosition(-5)).toBe(0);
    expect(clampTextPosition(140)).toBe(100);
    expect(clampTextPosition(33.333)).toBe(33.3);
  });
});

describe("moveInStack", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("menukar dengan tetangga; di ujung / id tak ada → daftar yang sama", () => {
    expect(moveInStack(items, "a", "forward").map((i) => i.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(moveInStack(items, "c", "backward").map((i) => i.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(moveInStack(items, "c", "forward")).toBe(items);
    expect(moveInStack(items, "a", "backward")).toBe(items);
    expect(moveInStack(items, "x", "forward")).toBe(items);
  });
});

describe("dragTextPosition", () => {
  const frame = { width: 270, height: 480 };

  it("px → persen frame; menempel ke tengah dalam 8 px", () => {
    // 27 px = 10% lebar; 48 px = 10% tinggi.
    expect(
      dragTextPosition({ x: 20, y: 20 }, { dx: 27, dy: -48 }, frame),
    ).toEqual({ x: 30, y: 10, snapX: false, snapY: false });
    // x 47% = 8,1 px dari tengah (tidak menempel); y 49% = 4,8 px (menempel).
    expect(dragTextPosition({ x: 47, y: 49 }, { dx: 0, dy: 0 }, frame)).toEqual(
      { x: 47, y: 50, snapX: false, snapY: true },
    );
    expect(
      dragTextPosition({ x: 40, y: 80 }, { dx: 24, dy: 0 }, frame),
    ).toMatchObject({ x: 50, snapX: true });
  });

  it("dijepit di dalam frame; ukuran nol tidak menggeser", () => {
    expect(
      dragTextPosition({ x: 90, y: 5 }, { dx: 100, dy: -100 }, frame),
    ).toMatchObject({ x: 100, y: 0 });
    expect(
      dragTextPosition(
        { x: 30, y: 30 },
        { dx: 50, dy: 50 },
        {
          width: 0,
          height: 0,
        },
      ),
    ).toEqual({ x: 30, y: 30, snapX: false, snapY: false });
  });
});

describe("textRangeAfterDrag", () => {
  const initial = { startMs: 12_000, endMs: 15_000 };

  it("move menggeser kedua tepi; start/end hanya tepinya", () => {
    expect(textRangeAfterDrag(initial, 1_500, "move", clip)).toEqual({
      startMs: 13_500,
      endMs: 16_500,
    });
    expect(textRangeAfterDrag(initial, -1_000, "start", clip)).toEqual({
      startMs: 11_000,
      endMs: 15_000,
    });
    expect(textRangeAfterDrag(initial, 2_000, "end", clip)).toEqual({
      startMs: 12_000,
      endMs: 17_000,
    });
  });

  it("dijepit ke klip & durasi minimum", () => {
    expect(textRangeAfterDrag(initial, 9_000, "move", clip)).toEqual({
      startMs: 17_000,
      endMs: 20_000,
    });
    expect(textRangeAfterDrag(initial, 5_000, "start", clip)).toEqual({
      startMs: 14_500,
      endMs: 15_000,
    });
    expect(textRangeAfterDrag(initial, -5_000, "end", clip)).toEqual({
      startMs: 12_000,
      endMs: 12_500,
    });
  });
});
