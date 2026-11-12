import { z } from "zod";

/** Komponen skor klip yang dinilai Gemini (worker: `SUBSCORE_NAMES`). */
export const clipSubscoreNameSchema = z.enum([
  "hook",
  "flow",
  "value",
  "trend",
]);
export type ClipSubscoreName = z.infer<typeof clipSubscoreNameSchema>;

/** Skor 0–10 + alasan singkat (Bahasa Indonesia) untuk satu komponen. */
export const clipSubscoreSchema = z.object({
  score: z.number().int().min(0).max(10),
  comment: z.string(),
});
export type ClipSubscore = z.infer<typeof clipSubscoreSchema>;

/**
 * Isi kolom `clips.details` (worker: `details_to_json`). Batas klip selalu di tepi kalimat:
 * `startTokenId`/`endTokenId` = token pertama/terakhir klip di transkrip sumber.
 */
export const clipDetailsSchema = z.object({
  sourceId: z.string().min(1),
  /** Rata-rata subskor 0–10; dasar peringkat & skor 60–99 (kolom `clips.score`/`rank`). */
  rawScore: z.number().min(0).max(10),
  hook: z.string(),
  startTokenId: z.string().min(1),
  endTokenId: z.string().min(1),
  /**
   * Kata kunci yang disorot caption (dipilih Gemini saat discover), dalam bentuk kunci kata:
   * huruf kecil tanpa tanda baca di tepi. Klip sebelum T6.2 tidak punya → kosong.
   */
  keywords: z.array(z.string()).default([]),
  subscores: z.object({
    hook: clipSubscoreSchema,
    flow: clipSubscoreSchema,
    value: clipSubscoreSchema,
    trend: clipSubscoreSchema,
  }),
});
export type ClipDetails = z.infer<typeof clipDetailsSchema>;
