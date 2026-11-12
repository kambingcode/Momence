import { z } from "zod";

/** Batas teks custom per klip. */
export const MAX_TEXT_OVERLAYS = 8;
/** Panjang maksimum isi satu teks. */
export const TEXT_OVERLAY_MAX_LENGTH = 200;
/** Ukuran teks (persen lebar frame) yang diizinkan. */
export const TEXT_SIZE_MIN = 2;
export const TEXT_SIZE_MAX = 30;

/** Font Google Fonts berlisensi OFL untuk teks custom; semua punya subset latin (ã, ç, é). */
export const textFontSchema = z.enum([
  "montserrat",
  "poppins",
  "inter",
  "anton",
  "bebas-neue",
  "oswald",
  "playfair-display",
  "roboto-slab",
  "lobster",
  "pacifico",
  "bangers",
  "permanent-marker",
]);
export type TextFont = z.infer<typeof textFontSchema>;

const percent = z
  .number()
  .min(0, "Posisi teks harus di dalam frame (0–100%)")
  .max(100, "Posisi teks harus di dalam frame (0–100%)");
const sizeMessage = `Ukuran teks harus ${TEXT_SIZE_MIN}–${TEXT_SIZE_MAX}% lebar frame`;

/**
 * Teks custom di klip. Waktu dalam ms video sumber (seperti B-roll); `x`/`y` = pusat teks dalam
 * persen frame, `fontSize` = persen lebar frame, sehingga tetap benar saat rasio diganti. Isi
 * kosong boleh (sedang diketik) dan tidak digambar.
 */
export const textOverlaySchema = z
  .object({
    id: z.string().min(1).max(64),
    text: z
      .string()
      .max(
        TEXT_OVERLAY_MAX_LENGTH,
        `Teks maksimal ${TEXT_OVERLAY_MAX_LENGTH} karakter`,
      ),
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    x: percent,
    y: percent,
    fontSize: z
      .number()
      .min(TEXT_SIZE_MIN, sizeMessage)
      .max(TEXT_SIZE_MAX, sizeMessage),
    color: z.string().regex(/^#[0-9a-f]{6}$/i, "Warna teks harus hex #rrggbb"),
    font: textFontSchema,
  })
  .refine((item) => item.endMs > item.startMs, {
    message: "Rentang teks kosong",
  });
export type TextOverlay = z.infer<typeof textOverlaySchema>;

/** Daftar teks satu klip: urutan = urutan tumpuk (yang terakhir paling depan), id unik. */
export const textOverlaysSchema = z
  .array(textOverlaySchema)
  .max(MAX_TEXT_OVERLAYS, `Maksimal ${MAX_TEXT_OVERLAYS} teks per klip`)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    message: "Id teks ganda",
  });
