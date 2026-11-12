/** Ringkasan klip satu proyek untuk daftar proyek. */
export interface ClipStats {
  count: number;
  /** Skor klip terbaik 0–100 (lihat `bestClipScore`); `null` bila tidak ada klip berskor. */
  bestScore: number | null;
}

/**
 * Skor proyek = `rawScore` (rata-rata subskor 0–10) klip terbaik × 10, dibulatkan.
 * Skor 60–99 (`clips.score`) tidak dipakai: berbasis peringkat, sehingga klip terbaik tiap
 * video selalu 99 dan tidak membedakan proyek.
 */
export function bestClipScore(bestRawScore: number | null): number | null {
  if (bestRawScore === null || !Number.isFinite(bestRawScore)) return null;
  return Math.round(Math.min(10, Math.max(0, bestRawScore)) * 10);
}
