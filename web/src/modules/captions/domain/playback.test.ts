import { describe, expect, it } from "vitest";
import type { CaptionPage } from "./pages";
import { activeWordIndex, pageAt, wordProgress } from "./playback";

const page = (startMs: number, endMs: number, ...starts: number[]) => ({
  startMs,
  endMs,
  words: starts.map((s) => ({
    text: "x",
    startMs: s,
    endMs: s + 200,
    keyword: false,
  })),
});
const pages: CaptionPage[] = [
  page(0, 500, 0, 250),
  page(500, 900, 500),
  page(2000, 2500, 2000),
];

describe("sinkron per kata", () => {
  it("pageAt: halaman yang tampil, null di celah", () => {
    expect(pageAt(pages, 0)).toBe(pages[0]);
    expect(pageAt(pages, 499)).toBe(pages[0]);
    expect(pageAt(pages, 500)).toBe(pages[1]);
    expect(pageAt(pages, 1500)).toBeNull();
    expect(pageAt(pages, 2499)).toBe(pages[2]);
    expect(pageAt(pages, 2500)).toBeNull();
  });

  it("activeWordIndex: kata terakhir yang sudah mulai, tetap aktif di celah", () => {
    const first = pages[0]!;
    expect(activeWordIndex(first, -1)).toBe(-1);
    expect(activeWordIndex(first, 0)).toBe(0);
    expect(activeWordIndex(first, 249)).toBe(0);
    expect(activeWordIndex(first, 250)).toBe(1);
    expect(activeWordIndex(first, 499)).toBe(1);
  });

  it("wordProgress: 0 sebelum, naik linear, 1 setelah kata", () => {
    const w = pages[0]!.words[0]!;
    expect(wordProgress(w, -10)).toBe(0);
    expect(wordProgress(w, 50)).toBe(0.25);
    expect(wordProgress(w, 400)).toBe(1);
  });
});
