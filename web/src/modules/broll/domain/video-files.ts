/** Satu file dari daftar file video stok (beberapa resolusi). */
export interface VideoFile {
  width: number;
  height: number;
  fileType: string;
  link: string;
}

/** Sisi pendek file untuk render (sama dengan sisi pendek komposisi) & pratinjau editor. */
export const RENDER_SHORT_SIDE = 1080;
export const PREVIEW_SHORT_SIDE = 540;

const shortSide = (file: VideoFile) => Math.min(file.width, file.height);

/**
 * File MP4 terkecil yang sisi pendeknya ≥ `target` (tidak perlu memperbesar), atau yang
 * terbesar bila semuanya lebih kecil. Tanpa MP4 → `null`.
 */
export function pickVideoFile(
  files: readonly VideoFile[],
  target: number,
): VideoFile | null {
  const mp4 = files
    .filter((f) => f.fileType === "video/mp4" && f.width > 0 && f.height > 0)
    .sort((a, b) => shortSide(a) - shortSide(b));
  return mp4.find((f) => shortSide(f) >= target) ?? mp4.at(-1) ?? null;
}
