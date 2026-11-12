import { describe, expect, it } from "vitest";
import type { Timeline } from "@/modules/editor/application";
import { frameAction, playFromMs } from "./playback";

// Klip 10–40 dtk dengan potongan 20–25 dtk.
const timeline: Timeline = {
  segments: [
    { startMs: 10_000, endMs: 20_000 },
    { startMs: 25_000, endMs: 40_000 },
  ],
  durationMs: 25_000,
};

describe("frameAction", () => {
  it("terus memutar di dalam segmen", () => {
    expect(frameAction(timeline, 10_000)).toEqual({ kind: "play" });
    expect(frameAction(timeline, 30_000)).toEqual({ kind: "play" });
    // Sedikit di bawah awal segmen setelah seek: jangan melompat lagi.
    expect(frameAction(timeline, 24_998)).toEqual({ kind: "play" });
  });

  it("melompati potongan dan bagian sebelum klip", () => {
    expect(frameAction(timeline, 19_980)).toEqual({
      kind: "jump",
      toMs: 25_000,
    });
    expect(frameAction(timeline, 22_000)).toEqual({
      kind: "jump",
      toMs: 25_000,
    });
    expect(frameAction(timeline, 0)).toEqual({ kind: "jump", toMs: 10_000 });
  });

  it("berhenti di ujung klip", () => {
    expect(frameAction(timeline, 39_960)).toEqual({ kind: "play" });
    expect(frameAction(timeline, 39_975)).toEqual({ kind: "end" });
    expect(frameAction(timeline, 50_000)).toEqual({ kind: "end" });
  });
});

describe("playFromMs", () => {
  it("lanjut dari posisi sekarang, atau dari awal bila di ujung/luar klip", () => {
    expect(playFromMs(timeline, 15_000)).toBe(15_000);
    expect(playFromMs(timeline, 22_000)).toBe(25_000);
    expect(playFromMs(timeline, 39_990)).toBe(10_000);
    expect(playFromMs(timeline, 0)).toBe(10_000);
  });

  it("null bila semua bagian terpotong", () => {
    expect(playFromMs({ segments: [], durationMs: 0 }, 0)).toBeNull();
  });
});
