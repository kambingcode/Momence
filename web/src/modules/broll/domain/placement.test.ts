import { describe, expect, it } from "vitest";
import { brollRows, manualRange, placeBroll, removeBrollAt } from "./placement";

const item = (startMs: number, endMs: number, id = startMs) => ({
  startMs,
  endMs,
  id,
});

describe("placeBroll", () => {
  it("menyisipkan terurut & mengganti yang tumpang-tindih", () => {
    const items = [item(1_000, 3_000), item(8_000, 10_000)];
    expect(placeBroll(items, item(4_000, 6_000))).toEqual([
      items[0],
      item(4_000, 6_000),
      items[1],
    ]);
    // Rentang yang sama (Ganti) & yang menyentuh sebagian diganti; bersinggungan di tepi tidak.
    expect(placeBroll(items, item(2_000, 8_000, 99))).toEqual([
      item(2_000, 8_000, 99),
      items[1],
    ]);
    expect(placeBroll(items, item(1_000, 3_000, 99))).toEqual([
      item(1_000, 3_000, 99),
      items[1],
    ]);
    expect(placeBroll(items, item(3_000, 8_000))).toEqual([
      items[0],
      item(3_000, 8_000),
      items[1],
    ]);
  });

  it("removeBrollAt melepas item yang mulai di waktu itu saja", () => {
    const items = [item(1_000, 3_000), item(8_000, 10_000)];
    expect(removeBrollAt(items, 8_000)).toEqual([items[0]]);
    expect(removeBrollAt(items, 5_000)).toEqual(items);
  });
});

describe("brollRows", () => {
  const slots = [
    { startMs: 4_000, endMs: 6_000, intent: "a" },
    { startMs: 12_000, endMs: 15_000, intent: "b" },
  ];

  it("slot + B-roll yang menimpanya, ditambah B-roll tanpa slot, terurut", () => {
    const onSlot = item(4_500, 7_000);
    const manual = item(1_000, 3_000);
    expect(brollRows(slots, [manual, onSlot])).toEqual([
      { range: manual, slot: null, item: manual },
      { range: onSlot, slot: slots[0], item: onSlot },
      { range: slots[1], slot: slots[1], item: null },
    ]);
  });

  it("satu B-roll hanya dipasangkan ke satu slot", () => {
    const wide = item(5_000, 13_000);
    const rows = brollRows(slots, [wide]);
    expect(rows.map((r) => [r.slot?.intent, r.item?.id])).toEqual([
      ["a", 5_000],
      ["b", undefined],
    ]);
  });
});

describe("manualRange", () => {
  it("panjang tetap, dipotong di akhir klip", () => {
    expect(manualRange(10_000, 60_000, 3_000)).toEqual({
      startMs: 10_000,
      endMs: 13_000,
    });
    expect(manualRange(59_000, 60_000, 3_000)).toEqual({
      startMs: 59_000,
      endMs: 60_000,
    });
    expect(manualRange(60_000, 60_000, 3_000)).toBeNull();
    // Posisi pratinjau dari nomor frame bisa pecahan; EditingScript butuh ms bulat.
    expect(manualRange(34_848.333, 60_000, 3_000)).toEqual({
      startMs: 34_848,
      endMs: 37_848,
    });
  });
});
