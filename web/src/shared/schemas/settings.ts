import { z } from "zod";

/** Batas ambang jeda; sama dengan `PAUSE_SLIDER_MS` di modul cleanup (dicek unit test settings). */
export const PAUSE_MIN_MS_RANGE = { min: 300, max: 5000, step: 100 } as const;

/** Entri daftar filler ditulis bebas ("Ummm", "apa ya"), tetapi harus berisi huruf. */
const fillerEntrySchema = (maxLength: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .regex(/\p{L}/u, "Entri filler harus berisi huruf");

/**
 * Pengaturan pengguna (halaman Settings). Dibaca web (panel Speech cleanup) dan worker
 * (`settings/application/payloads.py`): model Gemini untuk job `discover` & `broll-plan`,
 * daftar kata pengisi untuk job `transcribe`.
 */
export const preferencesSchema = z.object({
  /** `null` = model bawaan worker (`CLIPSTUDIO_GEMINI_MODEL`, default `gemini-3.6-flash`). */
  geminiModel: z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:@-]*$/, "ID model Gemini tidak valid")
    .nullable(),
  /** Kata pengisi; satu kata per entri (worker mencocokkannya per token kata). */
  fillerWords: z
    .array(
      fillerEntrySchema(40).regex(
        /^\S+$/u,
        "Kata pengisi harus satu kata; tulis frasa di daftar frasa pengisi",
      ),
    )
    .max(200),
  /** Frasa pengisi (beberapa kata per entri); hanya dipakai panel Speech cleanup. */
  fillerPhrases: z.array(fillerEntrySchema(80)).max(200),
  /** Ambang jeda awal panel Speech cleanup. */
  pauseMinMs: z
    .number()
    .int()
    .min(PAUSE_MIN_MS_RANGE.min)
    .max(PAUSE_MIN_MS_RANGE.max)
    .multipleOf(PAUSE_MIN_MS_RANGE.step),
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** Baris `settings.preferences`: field yang belum pernah disimpan memakai nilai bawaan. */
export const storedPreferencesSchema = preferencesSchema.partial();
export type StoredPreferences = z.infer<typeof storedPreferencesSchema>;

/** Baris `settings.worker`: ditulis worker saat mulai, berkala, dan saat berhenti. */
export const workerStatusSchema = z.object({
  /** Worker punya GEMINI_API_KEY (nilainya tidak pernah disimpan). */
  geminiApiKey: z.boolean(),
  /** Model Gemini bawaan worker (env), dipakai bila `geminiModel` = null. */
  geminiModel: z.string(),
  whisperModel: z.string(),
  /** Epoch ms; diperbarui tiap ±30 dtk selama worker hidup. */
  heartbeatAt: z.number().int(),
  /** Epoch ms saat worker berhenti rapi; `null` selama berjalan. */
  stoppedAt: z.number().int().nullable(),
});
export type WorkerStatus = z.infer<typeof workerStatusSchema>;
