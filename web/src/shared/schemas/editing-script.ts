import { z } from "zod";
import { captionStyleSchema } from "./captions";
import { aspectRatioSchema } from "./reframe";
import { textOverlaysSchema } from "./text-overlay";

/** Satu grup potongan; dipulihkan per grup (undo/restore). */
export const removalSchema = z.object({
  removalId: z.string().min(1),
  tokenIds: z.array(z.string().min(1)).min(1),
  kind: z.enum(["manual", "filler", "pause"]),
});
export type Removal = z.infer<typeof removalSchema>;

/**
 * Pengaturan reframe klip. Jalur crop tidak disimpan di sini: dihitung worker untuk setiap rasio
 * (`clip_reframes.crops`, `cropTracksSchema`) lalu dipilih saat pratinjau & render. Default
 * mengisi data lama (sebelum Tracker & rasio ada).
 */
export const reframeSchema = z.object({
  /** `fill` = crop memenuhi frame, `fit` = video utuh di atas latar blur. */
  layout: z.enum(["fill", "fit"]),
  /** `fill`: crop mengikuti wajah (auto-reframe); mati → crop tengah. */
  tracker: z.boolean().default(true),
  aspectRatio: aspectRatioSchema.default("9:16"),
});
export type ReframeSettings = z.infer<typeof reframeSchema>;

/** Pengaturan untuk klip yang belum pernah diatur (`reframe: null`). */
export const defaultReframe = (): ReframeSettings => ({
  layout: "fill",
  tracker: true,
  aspectRatio: "9:16",
});

/**
 * Body `POST /api/clips/:id/broll-plan`: editan yang sedang dibuka di editor (boleh belum
 * disimpan), agar slot hanya jatuh di bagian yang dipertahankan.
 */
export const brollPlanBodySchema = z.object({
  removedTokenIds: z.array(z.string().min(1)),
  corrections: z.record(z.string().min(1), z.string()),
});
export type BrollPlanBody = z.infer<typeof brollPlanBodySchema>;

/**
 * B-roll terpasang: video stok (Pixabay) yang menutupi video utama pada rentang ini (ms video
 * sumber); audio tetap dari video utama.
 */
export const brollItemSchema = z
  .object({
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    /** Id video di sumber stok. */
    stockVideoId: z.number().int(),
    /** File MP4 resolusi render (sisi pendek ±1080 px). */
    url: z.string().url(),
    /** File MP4 kecil untuk pratinjau editor. */
    previewUrl: z.string().url(),
    thumbnailUrl: z.string().url(),
    /** Halaman video di sumber stok (tautan atribusi). */
    pageUrl: z.string().url(),
    /** Durasi video stok; lebih pendek dari rentangnya → diputar ulang. */
    durationMs: z.number().int().min(0),
    /** Kredit pembuat, mis. "Video oleh Nama di Pixabay". */
    attribution: z.string(),
  })
  .refine((item) => item.endMs > item.startMs, {
    message: "Rentang B-roll kosong",
  });
export type BrollItem = z.infer<typeof brollItemSchema>;

/**
 * Bagian EditingScript yang diedit pengguna (body Save). Waktu dalam ms video sumber; token
 * dirujuk dengan id dari transkrip (`wN`/`pN`).
 */
export const editingScriptInputSchema = z.object({
  removed: z.array(removalSchema),
  /** tokenId → teks caption pengganti (durasi tidak berubah). */
  corrections: z.record(z.string().min(1), z.string()),
  reframe: reframeSchema.nullable(),
  /** Gaya caption; `null` = preset bawaan. */
  caption: captionStyleSchema.nullable(),
  broll: z.array(brollItemSchema),
  /** Teks custom; EditingScript dari sebelum T15.1 tidak punya teks. */
  textOverlays: textOverlaysSchema.default([]),
});
export type EditingScriptInput = z.infer<typeof editingScriptInputSchema>;

/**
 * Isi kolom `editing_scripts.script`. `transcriptFingerprint` (diisi server) = sidik token di
 * rentang klip saat disimpan; berbeda dari transkrip sekarang → editan usang (transkripsi ulang
 * menggeser id token).
 */
export const editingScriptSchema = editingScriptInputSchema.extend({
  transcriptFingerprint: z.string().min(1),
});
export type EditingScript = z.infer<typeof editingScriptSchema>;

export const emptyEditingScriptInput = (): EditingScriptInput => ({
  removed: [],
  corrections: {},
  reframe: null,
  caption: null,
  broll: [],
  textOverlays: [],
});

/**
 * Body `PUT /api/clips/:id/editing-script`. `baseVersion` null = simpan pertama;
 * `transcriptFingerprint` = sidik token yang dilihat editor saat dibuka (ditolak bila transkrip
 * sudah berubah).
 */
export const saveEditingScriptBodySchema = z.object({
  baseVersion: z.number().int().min(1).nullable(),
  transcriptFingerprint: z.string().min(1),
  script: editingScriptInputSchema,
});
export type SaveEditingScriptBody = z.infer<typeof saveEditingScriptBodySchema>;
