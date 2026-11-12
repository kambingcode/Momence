import type { CleanupMatch } from "./cleanup";

/** Posisi `match` di `matches` (jenis & token pertama sama), atau -1. */
export const indexOfMatch = (
  matches: readonly CleanupMatch[],
  match: CleanupMatch,
): number =>
  matches.findIndex(
    (m) => m.kind === match.kind && m.tokenIds[0] === match.tokenIds[0],
  );

/**
 * Indeks temuan berikutnya (+1) / sebelumnya (-1) dari temuan yang sedang ditampilkan, berputar.
 * Bila `shown` sudah tidak ada di daftar (dihapus, ambang berubah), lanjut dari posisi waktunya;
 * tanpa `shown` → temuan pertama / terakhir. Daftar kosong → -1.
 */
export function stepMatch(
  matches: readonly CleanupMatch[],
  shown: CleanupMatch | null,
  step: -1 | 1,
): number {
  const count = matches.length;
  if (count === 0) return -1;
  if (!shown) return step > 0 ? 0 : count - 1;
  const at = indexOfMatch(matches, shown);
  if (at >= 0) return (at + step + count) % count;
  const next =
    step > 0
      ? matches.findIndex((m) => m.startMs > shown.startMs)
      : matches.findLastIndex((m) => m.startMs < shown.startMs);
  if (next >= 0) return next;
  return step > 0 ? 0 : count - 1;
}
