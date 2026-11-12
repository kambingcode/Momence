/** Bentuk minimal token bertimestamp (ms di video sumber), berurutan & tanpa tumpang-tindih. */
export interface TimedToken {
  type: "word" | "filler" | "pause";
  startMs: number;
  endMs: number;
}

/**
 * Indeks token yang sedang diucapkan pada `timeMs` (biner, O(log n)): token terakhir yang
 * mulai ≤ `timeMs` selama waktunya belum lewat dari akhirnya. Di celah antar-token → -1.
 */
export function tokenIndexAt(
  tokens: readonly TimedToken[],
  timeMs: number,
): number {
  let low = 0;
  let high = tokens.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (tokens[mid].startMs <= timeMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found >= 0 && timeMs < tokens[found].endMs ? found : -1;
}

/** Jeda sepanjang ini atau lebih memulai paragraf baru. */
export const PARAGRAPH_BREAK_MS = 1500;

/**
 * Kelompokkan token menjadi paragraf (rentang indeks [start, end)) agar transkrip panjang mudah
 * dibaca: paragraf baru setelah jeda ≥ `breakMs`. Jeda pemisah tetap di akhir paragraf sebelumnya.
 */
export function paragraphRanges(
  tokens: readonly TimedToken[],
  breakMs: number = PARAGRAPH_BREAK_MS,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  tokens.forEach((token, index) => {
    const isBreak =
      token.type === "pause" && token.endMs - token.startMs >= breakMs;
    if (isBreak && index + 1 < tokens.length) {
      ranges.push({ start, end: index + 1 });
      start = index + 1;
    }
  });
  if (start < tokens.length) ranges.push({ start, end: tokens.length });
  return ranges;
}
