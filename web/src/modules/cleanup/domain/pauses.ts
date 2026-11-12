import { type CleanupMatch, type CleanupToken, matchOf } from "./cleanup";

/** Ambang durasi jeda awal di panel Speech cleanup. */
export const DEFAULT_PAUSE_MS = 500;

/**
 * Rentang slider ambang jeda. Mulai 300 ms, bukan 100 ms: worker hanya membuat token jeda untuk
 * hening ≥ 300 ms (`MIN_PAUSE_MS`), dan hening yang lebih pendek tidak terukur andal (VAD
 * beresolusi 32 ms, tepi ucapan meleset hingga ±70 ms).
 */
export const PAUSE_SLIDER_MS = { min: 300, max: 5000, step: 100 } as const;

/** Token jeda yang durasinya ≥ `minDurationMs`, masing-masing satu temuan. */
export function detectPauses(
  tokens: readonly CleanupToken[],
  minDurationMs: number,
): CleanupMatch[] {
  return tokens
    .filter((t) => t.type === "pause" && t.endMs - t.startMs >= minDurationMs)
    .map((t) => matchOf("pause", [t], ""));
}
