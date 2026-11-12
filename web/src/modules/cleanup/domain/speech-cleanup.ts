import type { CleanupMatch, CleanupToken } from "./cleanup";
import {
  DEFAULT_FILLER_CONFIG,
  detectFillers,
  type FillerConfig,
} from "./fillers";
import { detectPauses } from "./pauses";

/**
 * Temuan jeda (≥ `pauseMinMs`), filler, frasa, dan kata berulang pada token yang belum
 * terpotong: temuan yang sudah dihapus tidak dihitung lagi, dan pengulangan dinilai dari ucapan
 * setelah potongan. Urut waktu.
 */
export function findCleanup(
  tokens: readonly CleanupToken[],
  removedIds: ReadonlySet<string>,
  pauseMinMs: number,
  config: FillerConfig = DEFAULT_FILLER_CONFIG,
): CleanupMatch[] {
  const kept = tokens.filter((t) => !removedIds.has(t.id));
  return [
    ...detectPauses(kept, pauseMinMs),
    ...detectFillers(kept, config),
  ].sort((a, b) => a.startMs - b.startMs);
}

export interface CleanupRemoval {
  tokenIds: string[];
  kind: "filler" | "pause";
}

/** Satu grup potongan per temuan (bisa dipulihkan satu per satu); jenis grup = jeda / filler. */
export const removalsFor = (
  matches: readonly CleanupMatch[],
): CleanupRemoval[] =>
  matches.map((m) => ({
    tokenIds: m.tokenIds,
    kind: m.kind === "pause" ? "pause" : "filler",
  }));
