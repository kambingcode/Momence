import type { CaptionPage, CaptionWord } from "./pages";

/** Halaman yang tampil pada waktu klip `tMs` (biner), atau `null` di antara halaman. */
export function pageAt(
  pages: readonly CaptionPage[],
  tMs: number,
): CaptionPage | null {
  let low = 0;
  let high = pages.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const page = pages[mid]!;
    if (tMs < page.startMs) high = mid - 1;
    else if (tMs >= page.endMs) low = mid + 1;
    else return page;
  }
  return null;
}

/**
 * Kata yang sedang diucapkan: kata terakhir yang sudah mulai. Tetap aktif di celah antar-kata
 * agar sorotan tidak berkedip; -1 sebelum kata pertama.
 */
export function activeWordIndex(page: CaptionPage, tMs: number): number {
  let active = -1;
  page.words.forEach((word, i) => {
    if (word.startMs <= tMs) active = i;
  });
  return active;
}

/** Bagian kata yang sudah diucapkan, 0–1 (pengisian karaoke). */
export function wordProgress(word: CaptionWord, tMs: number): number {
  const length = word.endMs - word.startMs;
  if (length <= 0) return tMs >= word.startMs ? 1 : 0;
  return Math.min(1, Math.max(0, (tMs - word.startMs) / length));
}
