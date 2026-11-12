import { z } from "zod";

/** Rasio video hasil yang bisa dipilih. */
export const aspectRatioSchema = z.enum(["9:16", "1:1", "16:9"]);
export type AspectRatio = z.infer<typeof aspectRatioSchema>;

/** Persegi crop dalam pecahan 0–1 lebar/tinggi video sumber (sama untuk proxy & sumber). */
export const cropRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});
export type CropRect = z.infer<typeof cropRectSchema>;

/** Posisi crop pada waktu sumber `tMs`; di antara dua keyframe diinterpolasi linear. */
export const cropKeyframeSchema = z.object({
  tMs: z.number().int().min(0),
  cropRect: cropRectSchema,
});
export type CropKeyframe = z.infer<typeof cropKeyframeSchema>;

/**
 * Kolom `clip_reframes.crops` (worker: `crops_to_json`): jalur crop auto-reframe per rasio,
 * mengikuti wajah utama. `[]` = rasio sama dengan sumber (frame utuh, tanpa crop).
 */
export const cropTracksSchema = z.object({
  "9:16": z.array(cropKeyframeSchema),
  "1:1": z.array(cropKeyframeSchema),
  "16:9": z.array(cropKeyframeSchema),
});
export type CropTracks = z.infer<typeof cropTracksSchema>;
