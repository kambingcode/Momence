import { z } from "zod";

/** Preset caption animasi (cermin `CAPTION_PRESETS` modul captions). */
export const captionPresetSchema = z.enum([
  "karaoke",
  "pop",
  "highlight-box",
  "word-by-word",
  "simple",
  "bold-uppercase",
]);
export type CaptionPresetId = z.infer<typeof captionPresetSchema>;

/** Font Google Fonts berlisensi OFL yang tersedia untuk caption. */
export const captionFontSchema = z.enum([
  "montserrat",
  "poppins",
  "anton",
  "bebas-neue",
  "inter",
]);

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

/**
 * Gaya caption di EditingScript (`caption`; `null` = preset bawaan). Ukuran dalam piksel pada
 * kanvas 1080 px; warna: teks biasa, kata yang sedang diucapkan, dan kata kunci.
 */
export const captionStyleSchema = z.object({
  preset: captionPresetSchema,
  font: captionFontSchema,
  textColor: hexColor,
  highlightColor: hexColor,
  keywordColor: hexColor,
  size: z.number().int().min(32).max(200),
  position: z.enum(["top", "middle", "bottom"]),
  uppercase: z.boolean(),
});
export type CaptionStyleInput = z.infer<typeof captionStyleSchema>;
