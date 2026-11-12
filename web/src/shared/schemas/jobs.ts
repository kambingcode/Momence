import { z } from "zod";
import { clipFocusSchema } from "./clip-focus";
import { transcriptLanguageSchema, transcriptTokenSchema } from "./transcript";

/** Tipe job yang dikenal web & worker (worker: payloads.py di tiap modul). */
export const jobTypeSchema = z.enum([
  "noop",
  "download",
  "download-audio",
  "ingest",
  "transcribe",
  "discover",
  "reframe",
  "render",
  "broll-plan",
  "post-copy",
]);
export type JobType = z.infer<typeof jobTypeSchema>;

/** Job uji: worker hanya menunggu `durationMs` sambil melaporkan progres. */
export const noopPayloadSchema = z.object({
  durationMs: z.number().int().min(0).max(60_000).default(2000),
});
export type NoopPayload = z.infer<typeof noopPayloadSchema>;

/** Sisi terpendek maksimum unduhan video; 1080 = bawaan. */
export const downloadResolutionSchema = z.union([
  z.literal(720),
  z.literal(1080),
]);
export type DownloadResolution = z.infer<typeof downloadResolutionSchema>;

/**
 * Unduh video sumber dari link (YouTube atau VOD Twitch, maks 1080p) ke `sources.path`, lalu worker mengantre
 * `ingest`. Diantre oleh web saat proyek diimpor dari link. `audioFirst`: audio sudah diambil job
 * `download-audio` (yang juga mengantre transkripsi), jadi `ingest` tidak mengekstrak audio lagi.
 */
export const downloadPayloadSchema = z.object({
  sourceId: z.string().min(1),
  url: z.string().url(),
  audioFirst: z.boolean().optional(),
  /** Pilihan kualitas pengguna; tanpa nilai = 1080. */
  maxResolution: downloadResolutionSchema.optional(),
});
export type DownloadPayload = z.infer<typeof downloadPayloadSchema>;

/**
 * Unduh hanya suara video dari link ke `audio.wav` (detik–menit untuk stream berjam-jam), lalu worker
 * mengantre `transcribe`. Berjalan bersamaan dengan `download` (video penuh) agar klip bisa
 * ditemukan sebelum video selesai diunduh. Diantre web sebelum `download`.
 */
export const downloadAudioPayloadSchema = z.object({
  sourceId: z.string().min(1),
  url: z.string().url(),
});
export type DownloadAudioPayload = z.infer<typeof downloadAudioPayloadSchema>;

/** Body `POST /api/projects/import`. */
export const importVideoRequestSchema = z.object({
  url: z.string().trim().min(1, "Link video wajib diisi.").max(2000),
  /** Arahan opsional untuk pemilihan klip (mis. "momen lucu"); lihat `clipFocusSchema`. */
  clipFocus: clipFocusSchema,
  /** Kualitas unduhan: 720 ≈ separuh ukuran & waktu unduh, hasil export lebih lembut. */
  maxResolution: downloadResolutionSchema.optional(),
});
export type ImportVideoRequest = z.infer<typeof importVideoRequestSchema>;

/** Body `POST /api/projects/[id]/discover` ("Cari ulang klip"). */
export const discoverRequestSchema = z.object({
  clipFocus: clipFocusSchema,
});
export type DiscoverRequest = z.infer<typeof discoverRequestSchema>;

/** Probe, ekstrak audio, dan buat proxy dari video sumber. */
export const ingestPayloadSchema = z.object({
  sourceId: z.string().min(1),
  /** Audio sudah ada (diambil `download-audio`): hanya buat proxy & thumbnail. */
  audioReady: z.boolean().optional(),
});
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

/** Transkripsi audio hasil ingest (diantre oleh worker setelah ingest selesai). */
export const transcribePayloadSchema = z.object({
  sourceId: z.string().min(1),
});
export type TranscribePayload = z.infer<typeof transcribePayloadSchema>;

/** Cari kandidat klip dengan Gemini (diantre oleh worker setelah transcribe selesai). */
export const discoverPayloadSchema = z.object({
  sourceId: z.string().min(1),
});
export type DiscoverPayload = z.infer<typeof discoverPayloadSchema>;

/**
 * Analisis reframe (wajah & batas adegan) klip-klip ini. Diantre worker setelah discover; klip
 * yang analisisnya masih berlaku dilewati.
 */
export const reframePayloadSchema = z.object({
  clipIds: z.array(z.string().min(1)).min(1),
});
export type ReframePayload = z.infer<typeof reframePayloadSchema>;

/**
 * Render klip ke MP4. Worker menjalankan `web/scripts/render-clip.mts`; `props` = props komposisi
 * Remotion `clip` tanpa `src` (dibuat `StartClipRender`, diteruskan apa adanya ke renderer).
 */
export const renderPayloadSchema = z.object({
  clipId: z.string().min(1),
  /** Video sumber resolusi penuh, relatif terhadap direktori data. */
  sourcePath: z.string().min(1),
  props: z.record(z.string(), z.unknown()),
});
export type RenderPayload = z.infer<typeof renderPayloadSchema>;

/** `jobs.result` render yang selesai (worker: `RenderClipJob`). */
export const renderResultSchema = z.object({
  clipId: z.string().min(1),
  /** MP4 hasil, relatif terhadap direktori data. */
  outputPath: z.string().min(1),
  sizeBytes: z.number().int().min(0),
});
export type RenderResult = z.infer<typeof renderResultSchema>;

/**
 * Rencana slot B-roll satu klip dengan Gemini (worker: modul `broll`). `tokens` = token klip yang
 * dipertahankan editor saat diminta (bagian terhapus tidak ikut, teks sudah dikoreksi).
 */
export const brollPlanPayloadSchema = z.object({
  clipId: z.string().min(1),
  title: z.string(),
  tokens: z.array(
    transcriptTokenSchema.pick({
      id: true,
      type: true,
      text: true,
      startMs: true,
      endMs: true,
    }),
  ),
});
export type BrollPlanPayload = z.infer<typeof brollPlanPayloadSchema>;

/** Tempat B-roll usulan Gemini; waktu dalam ms video sumber. */
export const brollSlotSchema = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  /** Nomor kalimat di klip (mulai 1) & teksnya. */
  sentence: z.number().int().min(1),
  text: z.string(),
  /** Apa yang terlihat di B-roll (Bahasa Indonesia). */
  intent: z.string(),
  /** Kueri pencarian video stok (bahasa Inggris), terbaik dulu. */
  keywords: z.array(z.string().min(1)).min(1),
});
export type BrollSlot = z.infer<typeof brollSlotSchema>;

/** `jobs.result` broll-plan yang selesai (worker: `PlanBrollJob`). */
export const brollPlanResultSchema = z.object({
  clipId: z.string().min(1),
  slots: z.array(brollSlotSchema),
});
export type BrollPlanResult = z.infer<typeof brollPlanResultSchema>;

/** Platform tujuan posting; menentukan gaya & batas panjang caption (worker: modul `social`). */
export const postPlatformSchema = z.enum(["tiktok", "reels", "shorts"]);
export type PostPlatform = z.infer<typeof postPlatformSchema>;

/** Bahasa caption yang diminta pengguna; `auto` = sama dengan bahasa transkrip. */
export const postLanguageChoiceSchema = z.enum(["auto", "id", "en"]);
export type PostLanguageChoice = z.infer<typeof postLanguageChoiceSchema>;

/** Body `POST /api/clips/:id/post-copy`. */
export const postCopyBodySchema = z.object({
  platform: postPlatformSchema,
  language: postLanguageChoiceSchema,
});
export type PostCopyBody = z.infer<typeof postCopyBodySchema>;

/**
 * Caption & hashtag posting satu klip dengan Gemini (worker: modul `social`). `transcript` =
 * ucapan klip dari transkrip tersimpan (tanpa jeda); `language: null` = bahasa transkrip.
 */
export const postCopyPayloadSchema = z.object({
  clipId: z.string().min(1),
  title: z.string(),
  hook: z.string(),
  platform: postPlatformSchema,
  language: transcriptLanguageSchema.nullable(),
  transcript: z.string(),
});
export type PostCopyPayload = z.infer<typeof postCopyPayloadSchema>;

/** `jobs.result` post-copy yang selesai (worker: `WritePostCopyJob`). */
export const postCopyResultSchema = z.object({
  clipId: z.string().min(1),
  platform: postPlatformSchema,
  caption: z.string().min(1),
  /** Varian untuk uji A/B; kosong bila tidak ada. */
  altCaption: z.string(),
  /** Hashtag lengkap dengan awalan `#`, paling relevan dulu. */
  hashtags: z.array(z.string().min(2)),
});
export type PostCopyResult = z.infer<typeof postCopyResultSchema>;
