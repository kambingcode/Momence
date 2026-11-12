import { z } from "zod";

/** Satu hasil pencarian video stok (Pixabay) yang bisa dipasang sebagai B-roll. */
export const stockVideoSchema = z.object({
  id: z.number().int(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  durationMs: z.number().int().min(0),
  /** Halaman video di sumber stok. */
  pageUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  /** Nama pembuat video (untuk atribusi). */
  author: z.string(),
  /** File MP4 resolusi render. */
  url: z.string().url(),
  /** File MP4 kecil untuk pratinjau. */
  previewUrl: z.string().url(),
});
export type StockVideo = z.infer<typeof stockVideoSchema>;

/** Body `GET /api/broll/search`. */
export const stockSearchResultSchema = z.object({
  videos: z.array(stockVideoSchema),
  page: z.number().int().min(1),
  hasMore: z.boolean(),
});
export type StockSearchResult = z.infer<typeof stockSearchResultSchema>;
