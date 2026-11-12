import { describe, expect, it } from "vitest";
import {
  addRemoval,
  applyCorrections,
  type RemovalGroup,
  removalOf,
  removedIdSet,
  restoreRemoval,
  restoreTouching,
} from "./edits";
import {
  collapsedAt,
  deleteAtCursor,
  dragSelection,
  isDragMove,
  moveCaret,
  restoreTargets,
  selectedRange,
} from "./selection";

describe("grup potongan", () => {
  const base: RemovalGroup[] = [
    { removalId: "r1", tokenIds: ["w2", "w3"], kind: "manual" },
  ];

  it("menambah grup hanya berisi token yang belum terpotong", () => {
    const next = addRemoval(base, ["w3", "w4", "w4", "w5"], "r2", "manual");
    expect(next).toEqual([
      ...base,
      { removalId: "r2", tokenIds: ["w4", "w5"], kind: "manual" },
    ]);
    expect(removedIdSet(next)).toEqual(new Set(["w2", "w3", "w4", "w5"]));
    expect(removalOf(next, "w4")?.removalId).toBe("r2");
    expect(removalOf(next, "w1")).toBeUndefined();
  });

  it("tanpa token baru → referensi sama (tidak membuat riwayat kosong)", () => {
    expect(addRemoval(base, ["w2"], "r2", "manual")).toBe(base);
    expect(addRemoval(base, [], "r2", "manual")).toBe(base);
  });

  it("memulihkan satu grup utuh", () => {
    const two = addRemoval(base, ["w9"], "r2", "manual");
    expect(restoreRemoval(two, "r1")).toEqual([two[1]]);
    expect(restoreRemoval(two, "tidak-ada")).toBe(two);
  });
});

describe("restoreTouching", () => {
  const groups: RemovalGroup[] = [
    { removalId: "r1", tokenIds: ["w1", "w2"], kind: "manual" },
    { removalId: "r2", tokenIds: ["w5"], kind: "manual" },
    { removalId: "r3", tokenIds: ["w7"], kind: "manual" },
  ];

  it("memulihkan grup utuh yang disentuh token mana pun", () => {
    expect(restoreTouching(groups, ["w2", "w5"])).toEqual([groups[2]]);
    expect(restoreTouching(groups, ["w9"])).toBe(groups);
  });
});

describe("applyCorrections", () => {
  const original = (id: string) => ({ w1: "halo", w2: "dunia" })[id];

  it("menambah, mengganti, dan menghapus koreksi", () => {
    expect(applyCorrections({}, { w1: " Halo " }, original)).toEqual({
      w1: "Halo",
    });
    expect(
      applyCorrections(
        { w1: "Halo", w2: "Dunia" },
        { w1: null, w2: "dunia" },
        original,
      ),
    ).toEqual({});
    expect(applyCorrections({ w1: "Halo" }, { w1: "  " }, original)).toEqual(
      {},
    );
  });

  it("tanpa perubahan → objek yang sama", () => {
    const current = { w1: "Halo" };
    expect(applyCorrections(current, { w1: "Halo" }, original)).toBe(current);
    expect(applyCorrections(current, { w2: "dunia" }, original)).toBe(current);
  });
});

describe("kursor & seleksi", () => {
  const n = 5;

  it("seleksi = rentang antara anchor dan caret", () => {
    expect(selectedRange(collapsedAt(2))).toBeNull();
    expect(selectedRange({ caret: 1, anchor: 3 })).toEqual([1, 3]);
    expect(selectedRange({ caret: 2, anchor: 2 })).toBeNull();
  });

  it("panah memindah kursor dalam batas; Shift memperluas seleksi", () => {
    expect(moveCaret(collapsedAt(0), -1, false, n)).toEqual(collapsedAt(0));
    expect(moveCaret(collapsedAt(5), 1, false, n)).toEqual(collapsedAt(5));
    const extended = moveCaret(
      moveCaret(collapsedAt(1), 1, true, n),
      1,
      true,
      n,
    );
    expect(extended).toEqual({ caret: 3, anchor: 1 });
    expect(selectedRange(extended)).toEqual([1, 3]);
  });

  it("panah tanpa Shift menciutkan seleksi ke tepinya", () => {
    const selection = { caret: 3, anchor: 1 };
    expect(moveCaret(selection, -1, false, n)).toEqual(collapsedAt(1));
    expect(moveCaret(selection, 1, false, n)).toEqual(collapsedAt(3));
  });

  it("token tersembunyi tidak punya lebar: dilewati bersama token terlihat berikutnya", () => {
    const hidden = (i: number) => i === 1 || i === 2;
    // Sebelum token 1 = sebelum token 3 secara visual → kanan melewati token 3.
    expect(moveCaret(collapsedAt(1), 1, false, n, hidden)).toEqual(
      collapsedAt(4),
    );
    expect(moveCaret(collapsedAt(3), -1, false, n, hidden)).toEqual(
      collapsedAt(0),
    );
  });

  it("seret ke kanan/kiri memilih kedua token ujung", () => {
    expect(selectedRange(dragSelection(1, 3))).toEqual([1, 4]);
    expect(selectedRange(dragSelection(3, 1))).toEqual([1, 4]);
    expect(selectedRange(dragSelection(2, 2))).toEqual([2, 3]);
  });

  it("seret hanya bila pointer bergerak ≥ 4 px (layout yang bergeser bukan seret)", () => {
    const start = { x: 100, y: 200 };
    expect(isDragMove(start, start)).toBe(false);
    expect(isDragMove(start, { x: 102, y: 202 })).toBe(false);
    expect(isDragMove(start, { x: 104, y: 200 })).toBe(true);
    expect(isDragMove(start, { x: 100, y: 190 })).toBe(true);
  });
});

describe("Backspace / Delete", () => {
  const n = 5;
  const none = () => false;

  it("dengan seleksi: memotong seleksi, kursor ke awalnya", () => {
    expect(deleteAtCursor({ caret: 4, anchor: 2 }, -1, n, none)).toEqual({
      indices: [2, 3],
      cursor: collapsedAt(2),
    });
  });

  it("Backspace memotong token di kiri, Delete di kanan", () => {
    expect(deleteAtCursor(collapsedAt(2), -1, n, none)).toEqual({
      indices: [1],
      cursor: collapsedAt(1),
    });
    expect(deleteAtCursor(collapsedAt(2), 1, n, none)).toEqual({
      indices: [2],
      cursor: collapsedAt(3),
    });
  });

  it("melewati token yang sudah terpotong; di tepi tidak terjadi apa-apa", () => {
    const removed = (i: number) => i === 1;
    expect(deleteAtCursor(collapsedAt(2), -1, n, removed).indices).toEqual([0]);
    expect(deleteAtCursor(collapsedAt(0), -1, n, none)).toEqual({
      indices: [],
      cursor: collapsedAt(0),
    });
    expect(deleteAtCursor(collapsedAt(5), 1, n, none).indices).toEqual([]);
  });
});

describe("restoreTargets", () => {
  const removed = (i: number) => i === 1 || i === 3;

  it("token terpotong di dalam seleksi", () => {
    expect(restoreTargets({ caret: 4, anchor: 0 }, 5, removed)).toEqual([1, 3]);
    expect(restoreTargets({ caret: 3, anchor: 2 }, 5, removed)).toEqual([]);
  });

  it("tanpa seleksi: token terpotong di kanan lalu kiri kursor", () => {
    expect(restoreTargets(collapsedAt(1), 5, removed)).toEqual([1]);
    expect(restoreTargets(collapsedAt(2), 5, removed)).toEqual([1]);
    expect(restoreTargets(collapsedAt(0), 5, removed)).toEqual([]);
    expect(restoreTargets(collapsedAt(5), 5, () => false)).toEqual([]);
  });
});
