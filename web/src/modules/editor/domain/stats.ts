import type { EditorToken } from "./clip-tokens";

export interface TranscriptStats {
  /** Kata & filler (jeda bukan kata). */
  words: number;
  /** Dari `words`, yang sedang terpotong. */
  removedWords: number;
}

/** Hitungan di kepala panel transkrip ("132 kata · 12 terpotong"). */
export function transcriptStats(
  tokens: readonly Pick<EditorToken, "id" | "type">[],
  removedIds: ReadonlySet<string>,
): TranscriptStats {
  let words = 0;
  let removedWords = 0;
  for (const token of tokens) {
    if (token.type === "pause") continue;
    words += 1;
    if (removedIds.has(token.id)) removedWords += 1;
  }
  return { words, removedWords };
}

export interface CutSummary {
  words: number;
  /** Dari awal token pertama sampai akhir token terakhir (0 bila kosong). */
  durationMs: number;
}

/** Ringkasan token yang akan dipotong ("4 kata · 1,3 dtk" di toolbar seleksi). */
export function cutSummary(
  tokens: readonly Pick<EditorToken, "type" | "startMs" | "endMs">[],
): CutSummary {
  const first = tokens[0];
  const last = tokens.at(-1);
  return {
    words: tokens.filter((token) => token.type !== "pause").length,
    durationMs: first && last ? Math.max(0, last.endMs - first.startMs) : 0,
  };
}
