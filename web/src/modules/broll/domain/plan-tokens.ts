/** Token transkrip (bentuk `transcriptTokenSchema`, cukup bagian yang dikirim ke worker). */
export interface PlanToken {
  id: string;
  type: "word" | "filler" | "pause";
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Token klip yang dikirim ke perencana B-roll: hanya yang dipertahankan editor (potongan tidak
 * ikut), teks kata memakai koreksi pengguna. Jeda yang tersisa ikut agar jeda panjang tetap
 * memutus kalimat.
 */
export function brollPlanTokens(
  tokens: readonly PlanToken[],
  removedIds: ReadonlySet<string>,
  corrections: Readonly<Record<string, string>>,
): PlanToken[] {
  return tokens
    .filter((token) => !removedIds.has(token.id))
    .map(({ id, type, text, startMs, endMs }) => ({
      id,
      type,
      text: corrections[id] ?? text,
      startMs,
      endMs,
    }));
}

/** Ada ucapan (kata/filler) yang bisa ditutup B-roll. */
export const hasSpeech = (tokens: readonly PlanToken[]): boolean =>
  tokens.some((token) => token.type !== "pause" && token.text.trim() !== "");

interface Range {
  startMs: number;
  endMs: number;
}

/** Berapa ms rentang `range` (waktu sumber) yang masih diputar di klip (segmen timeline). */
export function visibleMs(segments: readonly Range[], range: Range): number {
  return segments.reduce(
    (total, s) =>
      total +
      Math.max(
        0,
        Math.min(s.endMs, range.endMs) - Math.max(s.startMs, range.startMs),
      ),
    0,
  );
}
