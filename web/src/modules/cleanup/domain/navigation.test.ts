import { describe, expect, it } from "vitest";
import type { CleanupMatch } from "./cleanup";
import { indexOfMatch, stepMatch } from "./navigation";

const match = (id: string, startMs: number): CleanupMatch => ({
  kind: "filler",
  tokenIds: [id],
  startMs,
  endMs: startMs + 100,
  key: "eh",
});
const matches = [match("w1", 0), match("w5", 1000), match("w9", 2000)];

describe("stepMatch", () => {
  it("tanpa temuan yang ditampilkan → pertama / terakhir; daftar kosong → -1", () => {
    expect(stepMatch(matches, null, 1)).toBe(0);
    expect(stepMatch(matches, null, -1)).toBe(2);
    expect(stepMatch([], matches[0]!, 1)).toBe(-1);
  });

  it("berputar dari temuan yang ditampilkan", () => {
    expect(stepMatch(matches, matches[1]!, 1)).toBe(2);
    expect(stepMatch(matches, matches[2]!, 1)).toBe(0);
    expect(stepMatch(matches, matches[0]!, -1)).toBe(2);
  });

  it("temuan yang sudah dihapus → lanjut dari posisi waktunya", () => {
    const removed = match("w4", 800);
    expect(indexOfMatch(matches, removed)).toBe(-1);
    expect(stepMatch(matches, removed, 1)).toBe(1);
    expect(stepMatch(matches, removed, -1)).toBe(0);
    expect(stepMatch(matches, match("w12", 3000), 1)).toBe(0);
    expect(stepMatch(matches, match("w0", -1), -1)).toBe(2);
  });
});
