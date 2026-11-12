import { z } from "zod";

/** Panjang maksimum "fokus klip" (arahan pengguna untuk pemilihan klip oleh Gemini). */
export const CLIP_FOCUS_MAX_LENGTH = 500;

/**
 * Fokus klip opsional: teks bebas, dirapikan (trim); kosong/tidak ada → `null`.
 * Dipakai di body impor, query upload, dan permintaan discover ulang.
 */
export const clipFocusSchema = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null)
  .pipe(
    z
      .string()
      .max(
        CLIP_FOCUS_MAX_LENGTH,
        `Fokus klip maksimal ${CLIP_FOCUS_MAX_LENGTH} karakter.`,
      )
      .nullable(),
  );
export type ClipFocus = z.infer<typeof clipFocusSchema>;
