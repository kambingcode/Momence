import type { TimeRange } from "./clip-tokens";

/** Durasi teks baru. */
export const TEXT_DEFAULT_DURATION_MS = 3_000;
/** Durasi teks terpendek saat rentangnya diubah. */
export const TEXT_MIN_DURATION_MS = 500;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Rentang teks baru: `TEXT_DEFAULT_DURATION_MS` mulai `atMs` (posisi pratinjau), digeser mundur
 * bila melewati akhir klip; klip yang lebih pendek → seluruh klip.
 */
export function defaultTextRange(atMs: number, clip: TimeRange): TimeRange {
  const duration = Math.min(
    TEXT_DEFAULT_DURATION_MS,
    clip.endMs - clip.startMs,
  );
  const startMs = Math.round(clamp(atMs, clip.startMs, clip.endMs - duration));
  return { startMs, endMs: startMs + duration };
}

/**
 * Bagian yang diubah saat menyeret rentang teks: `move` = geser utuh (durasi tetap), `start` /
 * `end` = tarik tepi kiri / kanan (tepi lainnya tetap).
 */
export type RangeEdit = "move" | "start" | "end";

/**
 * Rentang teks dijepit ke dalam klip dengan durasi minimum `TEXT_MIN_DURATION_MS` (atau seluruh
 * klip bila klip lebih pendek), dalam ms bulat.
 */
export function clampTextRange(
  range: TimeRange,
  clip: TimeRange,
  edit: RangeEdit,
): TimeRange {
  const clipMs = clip.endMs - clip.startMs;
  const minMs = Math.min(TEXT_MIN_DURATION_MS, clipMs);
  if (edit === "move") {
    // Durasi dibulatkan dulu agar akhir rentang tidak melewati klip karena pembulatan.
    const duration = Math.round(
      clamp(range.endMs - range.startMs, minMs, clipMs),
    );
    const startMs = Math.round(
      clamp(range.startMs, clip.startMs, clip.endMs - duration),
    );
    return { startMs, endMs: startMs + duration };
  }
  if (edit === "start") {
    const endMs = Math.round(
      clamp(range.endMs, clip.startMs + minMs, clip.endMs),
    );
    return {
      startMs: Math.round(clamp(range.startMs, clip.startMs, endMs - minMs)),
      endMs,
    };
  }
  const startMs = Math.round(
    clamp(range.startMs, clip.startMs, clip.endMs - minMs),
  );
  return {
    startMs,
    endMs: Math.round(clamp(range.endMs, startMs + minMs, clip.endMs)),
  };
}

/** Posisi teks (persen frame) dijepit ke 0–100 & dibulatkan ke 0,1%. */
export const clampTextPosition = (percent: number): number =>
  Math.round(clamp(percent, 0, 100) * 10) / 10;

/**
 * Pindah satu teks satu langkah di urutan tumpuk (`forward` = ke depan / akhir daftar). Daftar
 * yang sama dikembalikan bila tidak berubah (sudah di ujung / id tidak ada).
 */
export function moveInStack<T extends { id: string }>(
  items: readonly T[],
  id: string,
  direction: "forward" | "backward",
): readonly T[] {
  const index = items.findIndex((item) => item.id === id);
  const target = direction === "forward" ? index + 1 : index - 1;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Jarak (px layar) dari garis tengah frame yang membuat teks menempel ke garis itu. */
export const TEXT_SNAP_PX = 8;

export interface TextDrag {
  x: number;
  y: number;
  /** Menempel ke garis tengah vertikal (x = 50%) / horizontal (y = 50%). */
  snapX: boolean;
  snapY: boolean;
}

/**
 * Posisi teks setelah diseret `delta` px dari posisi awal `start` (persen) di pratinjau berukuran
 * `frame` px: px → persen frame, menempel ke garis tengah dalam `snapPx`, lalu dijepit 0–100.
 */
export function dragTextPosition(
  start: { x: number; y: number },
  delta: { dx: number; dy: number },
  frame: { width: number; height: number },
  snapPx: number = TEXT_SNAP_PX,
): TextDrag {
  const axis = (from: number, px: number, size: number) => {
    if (size <= 0) return { value: clampTextPosition(from), snap: false };
    const value = from + (px / size) * 100;
    const snap = (Math.abs(value - 50) / 100) * size <= snapPx;
    return { value: clampTextPosition(snap ? 50 : value), snap };
  };
  const x = axis(start.x, delta.dx, frame.width);
  const y = axis(start.y, delta.dy, frame.height);
  return { x: x.value, y: y.value, snapX: x.snap, snapY: y.snap };
}

/**
 * Rentang teks setelah diseret `deltaMs` dari rentang awal `initial` (`move` = geser utuh,
 * `start` / `end` = tarik tepi), dijepit ke klip seperti `clampTextRange`.
 */
export function textRangeAfterDrag(
  initial: TimeRange,
  deltaMs: number,
  edit: RangeEdit,
  clip: TimeRange,
): TimeRange {
  const moved: TimeRange = {
    startMs: initial.startMs + (edit === "end" ? 0 : deltaMs),
    endMs: initial.endMs + (edit === "start" ? 0 : deltaMs),
  };
  return clampTextRange(moved, clip, edit);
}
