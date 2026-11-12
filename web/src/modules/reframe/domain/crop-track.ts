/** Persegi crop dalam pecahan 0–1 lebar/tinggi video sumber. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropKeyframe {
  /** Waktu video sumber (ms). */
  tMs: number;
  cropRect: CropRect;
}

/** Posisi & ukuran elemen video dalam persen komposisi. */
export interface VideoBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Crop pada waktu sumber `tMs`: interpolasi linear di antara dua keyframe, ditahan sebelum
 * keyframe pertama & sesudah yang terakhir. Tanpa keyframe → `null` (frame utuh / crop tengah).
 */
export function cropAt(
  keyframes: readonly CropKeyframe[],
  tMs: number,
): CropRect | null {
  const first = keyframes[0];
  const last = keyframes.at(-1);
  if (!first || !last) return null;
  if (tMs <= first.tMs) return first.cropRect;
  if (tMs >= last.tMs) return last.cropRect;
  // Keyframe pertama yang waktunya > tMs (pencarian biner; keyframe urut naik).
  let low = 1;
  let high = keyframes.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (keyframes[middle]!.tMs > tMs) high = middle;
    else low = middle + 1;
  }
  const a = keyframes[low - 1]!;
  const b = keyframes[low]!;
  const share = (tMs - a.tMs) / (b.tMs - a.tMs);
  const lerp = (from: number, to: number) => from + (to - from) * share;
  return {
    x: lerp(a.cropRect.x, b.cropRect.x),
    y: lerp(a.cropRect.y, b.cropRect.y),
    width: lerp(a.cropRect.width, b.cropRect.width),
    height: lerp(a.cropRect.height, b.cropRect.height),
  };
}

/**
 * Elemen video (persen komposisi) yang membuat `crop` tepat memenuhi komposisi. Rasio crop dibuat
 * worker sama dengan rasio komposisi, jadi skala horizontal & vertikal sama.
 */
export function videoBoxForCrop(crop: CropRect): VideoBox {
  return {
    left: (-crop.x / crop.width) * 100,
    top: (-crop.y / crop.height) * 100,
    width: 100 / crop.width,
    height: 100 / crop.height,
  };
}
