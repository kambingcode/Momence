import type { EditorToken, TimeRange } from "./clip-tokens";

/**
 * Sisa sebelum awal kata yang dipertahankan setelah potongan. Awal ucapan terukur 0–55 ms
 * terlambat (VAD tanpa padding, lihat T2.2), jadi memotong tepat di `startMs` bisa memangkas
 * awal kata. Akhir kata terukur terlambat juga, sehingga memotong tepat setelahnya aman.
 */
export const SPEECH_MARGIN_MS = 60;

/** Rentang video sumber yang diputar, berurutan & tidak tumpang-tindih. */
export interface Timeline {
  segments: TimeRange[];
  /** Durasi klip setelah potongan. */
  durationMs: number;
}

const isSpeech = (token: EditorToken) => token.type !== "pause";

/** Potongan per deret token terhapus yang bersebelahan (celah di dalam deret ikut terpotong). */
function cutsFor(
  tokens: readonly EditorToken[],
  removedIds: ReadonlySet<string>,
  range: TimeRange,
): TimeRange[] {
  const cuts: TimeRange[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!removedIds.has(tokens[i]!.id)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < tokens.length && removedIds.has(tokens[j + 1]!.id)) j += 1;
    const next = tokens[j + 1];
    // Deret di awal/akhir klip menyapu sampai tepi klip; celah di sebelah token yang
    // dipertahankan tetap ada.
    const startMs = i === 0 ? range.startMs : tokens[i]!.startMs;
    let endMs = next ? tokens[j]!.endMs : range.endMs;
    if (next && isSpeech(next))
      endMs = Math.min(endMs, next.startMs - SPEECH_MARGIN_MS);
    if (endMs > startMs) cuts.push({ startMs, endMs });
    i = j + 1;
  }
  return cuts;
}

/** Token klip (berurutan) + id token terhapus → rentang sumber yang dipertahankan. */
export function buildTimeline(
  tokens: readonly EditorToken[],
  removedIds: ReadonlySet<string>,
  range: TimeRange,
): Timeline {
  const segments: TimeRange[] = [];
  let cursor = range.startMs;
  for (const cut of cutsFor(tokens, removedIds, range)) {
    const startMs = Math.max(cut.startMs, range.startMs);
    if (startMs > cursor) segments.push({ startMs: cursor, endMs: startMs });
    cursor = Math.max(cursor, Math.min(cut.endMs, range.endMs));
  }
  if (range.endMs > cursor)
    segments.push({ startMs: cursor, endMs: range.endMs });
  const durationMs = segments.reduce((sum, s) => sum + s.endMs - s.startMs, 0);
  return { segments, durationMs };
}

/**
 * Waktu sumber → waktu klip. Di dalam potongan → titik sambungnya (awal segmen berikutnya);
 * sebelum/sesudah klip dijepit ke 0/durasi.
 */
export function sourceToClipMs(timeline: Timeline, sourceMs: number): number {
  let elapsed = 0;
  for (const s of timeline.segments) {
    if (sourceMs < s.startMs) return elapsed;
    if (sourceMs < s.endMs) return elapsed + sourceMs - s.startMs;
    elapsed += s.endMs - s.startMs;
  }
  return elapsed;
}

/**
 * Waktu klip → waktu sumber. Tepat di sambungan → awal segmen berikutnya; ≥ durasi → ujung
 * segmen terakhir. Timeline kosong (semua terpotong) → `null`.
 */
export function clipToSourceMs(
  timeline: Timeline,
  clipMs: number,
): number | null {
  const { segments } = timeline;
  if (segments.length === 0) return null;
  let remaining = Math.max(0, clipMs);
  for (const s of segments) {
    const length = s.endMs - s.startMs;
    if (remaining < length) return s.startMs + remaining;
    remaining -= length;
  }
  return segments.at(-1)!.endMs;
}

/**
 * Posisi sumber yang seharusnya diputar: `sourceMs` bila di dalam segmen, awal segmen
 * berikutnya bila di dalam potongan/sebelum klip, `null` bila sudah lewat segmen terakhir.
 */
export function playableSourceMs(
  timeline: Timeline,
  sourceMs: number,
): number | null {
  for (const s of timeline.segments) {
    if (sourceMs < s.startMs) return s.startMs;
    if (sourceMs < s.endMs) return sourceMs;
  }
  return null;
}
