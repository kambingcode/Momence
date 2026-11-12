export type Orientation = "portrait" | "square" | "landscape";

/** Selisih rasio sisi dari 1 yang masih dianggap persegi (mis. 1080×1000). */
const SQUARE_TOLERANCE = 0.1;

export function orientationOf(width: number, height: number): Orientation {
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= SQUARE_TOLERANCE) return "square";
  return ratio > 1 ? "landscape" : "portrait";
}

/**
 * Video berorientasi `wanted` di depan, sisanya di belakang; urutan asli (relevansi) di dalam
 * tiap kelompok dipertahankan. Untuk sumber stok yang tidak bisa memfilter orientasi — B-roll
 * tetap di-crop memenuhi frame, jadi orientasi lain masih bisa dipakai.
 */
export function orientationFirst<T extends { width: number; height: number }>(
  videos: readonly T[],
  wanted: Orientation,
): T[] {
  const matches = (v: T) => orientationOf(v.width, v.height) === wanted;
  return [...videos.filter(matches), ...videos.filter((v) => !matches(v))];
}
