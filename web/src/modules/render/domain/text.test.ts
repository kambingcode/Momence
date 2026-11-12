import { describe, expect, it } from "vitest";
import { compositionPlan } from "./composition";
import { textSequences, visibleTextIds } from "./text";

const text = (startMs: number, endMs: number, id = "t1") => ({
  id,
  startMs,
  endMs,
  text: "Halo",
});

const frames = (sequences: ReturnType<typeof textSequences>) =>
  sequences.map((s) => [s.fromFrame, s.durationInFrames]);

describe("textSequences", () => {
  it("rentang di klip utuh → satu sequence tanpa field waktu", () => {
    // Klip 10–20 dtk sumber; teks 12–15 dtk → frame 60–150 komposisi (30 fps).
    const plan = compositionPlan([{ startMs: 10_000, endMs: 20_000 }]);
    expect(textSequences(plan, [text(12_000, 15_000)])).toEqual([
      {
        fromFrame: 60,
        durationInFrames: 90,
        overlay: { id: "t1", text: "Halo" },
      },
    ]);
  });

  it("melintasi potongan → bagian terpotong dilewati, sisanya digabung", () => {
    // Dipotong 13–14 dan 16–17 dtk: teks 12–18 dtk tampil 12–13, 14–16, 17–18 = 4 dtk.
    const plan = compositionPlan([
      { startMs: 10_000, endMs: 13_000 },
      { startMs: 14_000, endMs: 16_000 },
      { startMs: 17_000, endMs: 20_000 },
    ]);
    expect(frames(textSequences(plan, [text(12_000, 18_000)]))).toEqual([
      [60, 120],
    ]);
  });

  it("seluruhnya di bagian terpotong → tidak tampil", () => {
    const plan = compositionPlan([
      { startMs: 10_000, endMs: 13_000 },
      { startMs: 16_000, endMs: 20_000 },
    ]);
    expect(textSequences(plan, [text(13_500, 15_500)])).toEqual([]);
  });

  it("melewati tepi klip → dipangkas ke klip; di luar klip → tidak tampil", () => {
    const plan = compositionPlan([{ startMs: 10_000, endMs: 20_000 }]);
    expect(frames(textSequences(plan, [text(8_000, 11_000)]))).toEqual([
      [0, 30],
    ]);
    expect(frames(textSequences(plan, [text(19_000, 25_000)]))).toEqual([
      [270, 30],
    ]);
    expect(textSequences(plan, [text(0, 5_000)])).toEqual([]);
  });

  it("dibulatkan ke frame terdekat; kurang dari ½ frame → tidak tampil", () => {
    const plan = compositionPlan([{ startMs: 0, endMs: 10_000 }]);
    // 1010 ms = frame 30,3 → 30; 2030 ms = 60,9 → 61.
    expect(frames(textSequences(plan, [text(1_010, 2_030)]))).toEqual([
      [30, 31],
    ]);
    expect(textSequences(plan, [text(1_000, 1_010)])).toEqual([]);
  });

  it("banyak teks: urutan tumpuk (urutan daftar) dipertahankan, boleh tumpang-tindih", () => {
    const plan = compositionPlan([{ startMs: 0, endMs: 10_000 }]);
    const result = textSequences(plan, [
      text(5_000, 6_000, "belakang"),
      text(1_000, 8_000, "depan"),
    ]);
    expect(result.map((s) => s.overlay.id)).toEqual(["belakang", "depan"]);
    expect(frames(result)).toEqual([
      [150, 30],
      [30, 210],
    ]);
  });
});

describe("visibleTextIds", () => {
  const sequence = (id: string, fromFrame: number, text = "Halo") => ({
    fromFrame,
    durationInFrames: 30,
    overlay: { id, text },
  });

  it("teks yang tampil pada frame ini; isi kosong tidak; id tidak ganda", () => {
    const sequences = [
      sequence("a", 0),
      sequence("b", 20),
      sequence("kosong", 0, "  "),
      sequence("a", 30),
    ];
    expect(visibleTextIds(sequences, 25)).toEqual(["a", "b"]);
    expect(visibleTextIds(sequences, 30)).toEqual(["b", "a"]);
    expect(visibleTextIds(sequences, 60)).toEqual([]);
  });
});
