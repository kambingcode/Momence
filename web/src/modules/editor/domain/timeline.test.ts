import { describe, expect, it } from "vitest";
import type { EditorToken } from "./clip-tokens";
import {
  buildTimeline,
  clipToSourceMs,
  playableSourceMs,
  sourceToClipMs,
  SPEECH_MARGIN_MS,
} from "./timeline";

const word = (id: string, startMs: number, endMs: number): EditorToken => ({
  id,
  type: "word",
  text: id,
  startMs,
  endMs,
});
const pause = (id: string, startMs: number, endMs: number): EditorToken => ({
  ...word(id, startMs, endMs),
  type: "pause",
  text: "",
});

// Klip 0–10 000. Celah 4000–4500 (ucapan tanpa kata) di antara w3 & w4.
const range = { startMs: 0, endMs: 10_000 };
const tokens = [
  word("w1", 0, 1000),
  word("w2", 1000, 2000),
  pause("p1", 2000, 3000),
  word("w3", 3000, 4000),
  word("w4", 4500, 6000),
  word("w5", 6000, 8000),
  word("w6", 8000, 10_000),
];
const M = SPEECH_MARGIN_MS;

const timeline = (...removed: string[]) =>
  buildTimeline(tokens, new Set(removed), range);

describe("buildTimeline", () => {
  it("tanpa potongan: satu segmen seluas klip", () => {
    expect(timeline()).toEqual({ segments: [range], durationMs: 10_000 });
  });

  it("potongan di awal menyapu dari awal klip, berhenti margin sebelum kata berikut", () => {
    expect(timeline("w1")).toEqual({
      segments: [{ startMs: 1000 - M, endMs: 10_000 }],
      durationMs: 9000 + M,
    });
  });

  it("potongan di tengah sebelum jeda: tanpa margin (jeda bukan ucapan)", () => {
    expect(timeline("w2").segments).toEqual([
      { startMs: 0, endMs: 1000 },
      { startMs: 2000, endMs: 10_000 },
    ]);
  });

  it("potongan di akhir menyapu sampai ujung klip", () => {
    expect(timeline("w6")).toEqual({
      segments: [{ startMs: 0, endMs: 8000 }],
      durationMs: 8000,
    });
  });

  it("token berurutan → satu potongan, celah di dalam deret ikut terpotong", () => {
    // w3 + w4: celah 4000–4500 di antaranya ikut hilang.
    expect(timeline("w3", "w4").segments).toEqual([
      { startMs: 0, endMs: 3000 },
      { startMs: 6000 - M, endMs: 10_000 },
    ]);
  });

  it("celah di tepi potongan dipertahankan", () => {
    // Hapus w3 saja: celah 4000–4500 tetap (bagian dari segmen berikutnya).
    expect(timeline("w3").segments).toEqual([
      { startMs: 0, endMs: 3000 },
      { startMs: 4000, endMs: 10_000 },
    ]);
  });

  it("dua grup tumpang-tindih / bersebelahan diperlakukan sebagai gabungan", () => {
    // Grup A = w2,p1 ; grup B = p1,w3 (p1 di keduanya) → satu potongan w2–w3.
    const merged = buildTimeline(
      tokens,
      new Set([...["w2", "p1"], ...["p1", "w3"]]),
      range,
    );
    expect(merged.segments).toEqual([
      { startMs: 0, endMs: 1000 },
      { startMs: 4000, endMs: 10_000 },
    ]);
  });

  it("beberapa potongan terpisah", () => {
    expect(timeline("w1", "w3", "w6")).toEqual({
      segments: [
        { startMs: 1000 - M, endMs: 3000 },
        { startMs: 4000, endMs: 8000 },
      ],
      durationMs: 2000 + M + 4000,
    });
  });

  it("semua token terhapus → durasi 0", () => {
    expect(timeline(...tokens.map((t) => t.id))).toEqual({
      segments: [],
      durationMs: 0,
    });
  });

  it("kata sangat pendek di antara kata: margin tidak membalik potongan", () => {
    const tight = [
      word("a", 0, 1000),
      word("b", 1000, 1030),
      word("c", 1030, 2000),
    ];
    expect(
      buildTimeline(tight, new Set(["b"]), { startMs: 0, endMs: 2000 })
        .segments,
    ).toEqual([{ startMs: 0, endMs: 2000 }]);
  });
});

describe("pemetaan waktu", () => {
  // Segmen: 0–1000 (klip 0–1000), 2000–10 000 (klip 1000–9000).
  const t = timeline("w2");

  it("sumber → klip, termasuk di dalam potongan dan di luar klip", () => {
    expect(sourceToClipMs(t, 500)).toBe(500);
    expect(sourceToClipMs(t, 1500)).toBe(1000);
    expect(sourceToClipMs(t, 2000)).toBe(1000);
    expect(sourceToClipMs(t, 2500)).toBe(1500);
    expect(sourceToClipMs(t, -10)).toBe(0);
    expect(sourceToClipMs(t, 20_000)).toBe(9000);
  });

  it("klip → sumber; tepat di sambungan memilih segmen berikutnya", () => {
    expect(clipToSourceMs(t, 0)).toBe(0);
    expect(clipToSourceMs(t, 999)).toBe(999);
    expect(clipToSourceMs(t, 1000)).toBe(2000);
    expect(clipToSourceMs(t, 9000)).toBe(10_000);
    expect(clipToSourceMs(t, 50_000)).toBe(10_000);
    expect(clipToSourceMs(timeline(...tokens.map((x) => x.id)), 0)).toBeNull();
  });

  it("bolak-balik konsisten di dalam segmen", () => {
    for (const clipMs of [0, 250, 999, 1000, 4321, 8999]) {
      expect(sourceToClipMs(t, clipToSourceMs(t, clipMs)!)).toBe(clipMs);
    }
  });

  it("posisi yang bisa diputar: melompati potongan, null setelah klip", () => {
    expect(playableSourceMs(t, 500)).toBe(500);
    expect(playableSourceMs(t, 1200)).toBe(2000);
    expect(playableSourceMs(t, -5)).toBe(0);
    expect(playableSourceMs(t, 10_000)).toBeNull();
  });
});
