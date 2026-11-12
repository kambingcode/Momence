import { z } from "zod";

/** Bahasa transkrip yang didukung (dideteksi worker, dibatasi ke id/en). */
export const transcriptLanguageSchema = z.enum(["id", "en"]);
export type TranscriptLanguage = z.infer<typeof transcriptLanguageSchema>;

/**
 * Satu token di kolom `transcripts.words` (worker: `token_to_json`), berurutan & tanpa
 * tumpang-tindih. Waktu dalam ms di video sumber; `id` dipakai EditingScript untuk menandai
 * potongan/koreksi: kata/filler `w1, w2, …`, jeda `p1, p2, …` (teks kosong, hening ≥ 300 ms
 * menurut VAD — tidak pernah berisi ucapan).
 */
export const transcriptTokenSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["word", "filler", "pause"]),
  text: z.string(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  confidence: z.number().min(0).max(1).nullable(),
});
export type TranscriptToken = z.infer<typeof transcriptTokenSchema>;
