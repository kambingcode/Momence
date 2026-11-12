import { describe, expect, it } from "vitest";
import {
  addRemoval,
  buildTimeline,
  removedIdSet,
  type RemovalGroup,
} from "@/modules/editor/application";
import type { CleanupToken } from "./cleanup";
import { findCleanup, removalsFor } from "./speech-cleanup";

const t = (
  id: string,
  text: string,
  startMs: number,
  endMs: number,
): CleanupToken => ({
  id,
  type: id.startsWith("p") ? "pause" : "word",
  text,
  startMs,
  endMs,
});

// "Jadi, eh, [0,8 dtk] saya saya mau, [0,4 dtk] you know, menabung."
const tokens = [
  t("w1", "Jadi,", 0, 300),
  t("w2", "eh,", 300, 500),
  t("p1", "", 500, 1300),
  t("w3", "saya", 1300, 1600),
  t("w4", "saya", 1600, 1900),
  t("w5", "mau,", 1900, 2200),
  t("p2", "", 2200, 2600),
  t("w6", "you", 2600, 2800),
  t("w7", "know,", 2800, 3000),
  t("w8", "menabung.", 3000, 3500),
];
const clip = { startMs: 0, endMs: 3500 };

describe("findCleanup", () => {
  it("menggabungkan jeda ≥ ambang & filler, urut waktu", () => {
    expect(
      findCleanup(tokens, new Set(), 500).map((m) => [m.kind, m.tokenIds]),
    ).toEqual([
      ["filler", ["w2"]],
      ["pause", ["p1"]],
      ["repeated", ["w3"]],
      ["phrase", ["w6", "w7"]],
    ]);
    expect(findCleanup(tokens, new Set(), 400).map((m) => m.kind)).toContain(
      "pause",
    );
  });

  it("mengabaikan token terpotong; pengulangan dinilai setelah potongan", () => {
    const found = findCleanup(tokens, new Set(["w2", "w4"]), 500);
    expect(found.map((m) => m.tokenIds)).toEqual([["p1"], ["w6", "w7"]]);
  });

  it("Hapus semua: hasilnya 0 temuan & durasi berkurang sesuai total potongan", () => {
    const matches = findCleanup(tokens, new Set(), 300);
    let removed: readonly RemovalGroup[] = [];
    removalsFor(matches).forEach((group, i) => {
      removed = addRemoval(removed, group.tokenIds, `r${i}`, group.kind);
    });
    expect(removed.map((r) => r.kind)).toEqual([
      "filler",
      "pause",
      "filler",
      "pause",
      "filler",
    ]);
    expect(findCleanup(tokens, removedIdSet(removed), 300)).toEqual([]);

    const before = buildTimeline(tokens, new Set(), clip).durationMs;
    const after = buildTimeline(tokens, removedIdSet(removed), clip).durationMs;
    // Dua deret bersebelahan: eh + jeda 0,8 + saya (1300 ms) dan jeda 0,4 + you know (800 ms);
    // tiap deret berhenti 60 ms sebelum kata berikutnya (SPEECH_MARGIN_MS).
    expect(before - after).toBe(1300 - 60 + (800 - 60));
  });
});
