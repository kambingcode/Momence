import type { Timeline } from "@/modules/editor/application";

/**
 * Sisa < 30 ms dari ujung segmen dianggap habis: requestAnimationFrame berjalan ±16 ms, jadi
 * tanpa toleransi sisa potongan berikutnya sempat terdengar sebelum dilompati.
 */
const SEGMENT_END_TOLERANCE_MS = 30;
/** `currentTime` setelah seek bisa sedikit di bawah target; jangan melompat berulang. */
const SEEK_SLACK_MS = 5;

export type FrameAction =
  { kind: "play" } | { kind: "jump"; toMs: number } | { kind: "end" };

/** Apa yang dilakukan pemutar pada posisi sumber `currentMs`. */
export function frameAction(
  timeline: Timeline,
  currentMs: number,
): FrameAction {
  for (const s of timeline.segments) {
    if (currentMs < s.startMs - SEEK_SLACK_MS)
      return { kind: "jump", toMs: s.startMs };
    if (currentMs < s.endMs - SEGMENT_END_TOLERANCE_MS) return { kind: "play" };
  }
  return { kind: "end" };
}

/**
 * Posisi saat tombol putar ditekan: lanjut bila masih di bagian yang diputar, selain itu dari
 * awal klip. `null` bila semua bagian klip terpotong.
 */
export function playFromMs(
  timeline: Timeline,
  currentMs: number,
): number | null {
  const first = timeline.segments[0];
  if (!first) return null;
  const action = frameAction(timeline, currentMs);
  if (action.kind === "play") return currentMs;
  if (action.kind === "jump") return action.toMs;
  return first.startMs;
}
