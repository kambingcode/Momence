import { describe, expect, it } from "vitest";
import { paragraphRanges, type TimedToken, tokenIndexAt } from "./tokens";

const word = (startMs: number, endMs: number): TimedToken => ({
  type: "word",
  startMs,
  endMs,
});
const pause = (startMs: number, endMs: number): TimedToken => ({
  type: "pause",
  startMs,
  endMs,
});

describe("tokenIndexAt", () => {
  const tokens = [
    pause(0, 500),
    word(500, 800),
    word(900, 1200),
    word(1200, 1500),
  ];

  it.each([
    [0, 0],
    [499, 0],
    [500, 1],
    [799, 1],
    // Celah 800–900 di antara kata: tidak ada yang aktif.
    [850, -1],
    [900, 2],
    // Batas bersama: kata berikutnya yang aktif.
    [1200, 3],
    [1499, 3],
    [1500, -1],
    [-10, -1],
  ])("t=%i → %i", (time, index) => {
    expect(tokenIndexAt(tokens, time)).toBe(index);
  });

  it("transkrip kosong", () => {
    expect(tokenIndexAt([], 100)).toBe(-1);
  });

  it("cepat untuk transkrip panjang", () => {
    const many = Array.from({ length: 50_000 }, (_, i) =>
      word(i * 100, i * 100 + 90),
    );
    expect(tokenIndexAt(many, 4_321_050)).toBe(43_210);
  });
});

describe("paragraphRanges", () => {
  it("memecah setelah jeda panjang, jeda tetap di paragraf sebelumnya", () => {
    const tokens = [
      word(0, 100),
      pause(100, 2000),
      word(2000, 2100),
      pause(2100, 2400),
      word(2400, 2500),
    ];
    expect(paragraphRanges(tokens)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 5 },
    ]);
  });

  it("jeda panjang di awal & akhir tidak membuat paragraf kosong", () => {
    const tokens = [pause(0, 8000), word(8000, 8200), pause(8200, 10_000)];
    expect(paragraphRanges(tokens)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 3 },
    ]);
    expect(paragraphRanges([])).toEqual([]);
  });
});
