import { z } from "zod";
import {
  captionStyleSchema,
  brollItemSchema,
  reframeSchema,
  removalSchema,
  textOverlaysSchema,
} from "@/shared/schemas";
import { docKey, docOf, type EditorDoc } from "./editor-store";

/** Draft editor di localStorage browser ini (per klip). */
const draftSchema = z.object({
  format: z.literal(1),
  /** Versi server saat draft mulai ditulis (dasar Save bila draft dilanjutkan). */
  baseVersion: z.number().int().min(1).nullable(),
  transcriptFingerprint: z.string(),
  /** Epoch milidetik. */
  savedAt: z.number(),
  removed: z.array(removalSchema),
  corrections: z.record(z.string(), z.string()),
  /** Draft dari sebelum panel caption (T6.3) tidak punya gaya caption → bawaan. */
  caption: captionStyleSchema.nullable().default(null),
  /** Draft dari sebelum panel reframe (T7.3) → pengaturan bawaan (lihat `docOf`). */
  reframe: reframeSchema.nullable().default(null),
  /** Draft dari sebelum panel B-roll (T8.2) → tanpa B-roll. */
  broll: z.array(brollItemSchema).default([]),
  /** Draft dari sebelum teks custom (T15.1) → tanpa teks. */
  textOverlays: textOverlaysSchema.default([]),
});
export type Draft = z.infer<typeof draftSchema>;

const draftKey = (clipId: string) => `clipstudio:draft:${clipId}`;

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// localStorage bisa tidak tersedia/penuh (mode privat; mengaksesnya saja bisa melempar
// SecurityError); draft hanya pengaman tambahan, jadi semua kegagalan diabaikan.
const browserStorage = (): DraftStorage => window.localStorage;

export function readDraft(
  clipId: string,
  storage?: DraftStorage,
): Draft | null {
  try {
    const raw = (storage ?? browserStorage()).getItem(draftKey(clipId));
    if (!raw) return null;
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeDraft(
  clipId: string,
  draft: Omit<Draft, "format">,
  storage?: DraftStorage,
): void {
  try {
    (storage ?? browserStorage()).setItem(
      draftKey(clipId),
      JSON.stringify({ format: 1, ...draft }),
    );
  } catch {
    // Abaikan: tanpa draft, editan tetap ada sampai tab ditutup.
  }
}

export function removeDraft(clipId: string, storage?: DraftStorage): void {
  try {
    (storage ?? browserStorage()).removeItem(draftKey(clipId));
  } catch {
    // Abaikan.
  }
}

export interface ServerState {
  doc: EditorDoc;
  /** Waktu Save terakhir; `null` bila belum pernah disimpan. */
  updatedAt: number | null;
  transcriptFingerprint: string;
}

/**
 * "offer" = tampilkan dialog Unsaved draft; "discard" = draft tidak berguna (sama dengan server,
 * lebih lama dari Save terakhir, atau untuk transkrip lain) → hapus diam-diam.
 */
export function draftDecision(
  draft: Draft | null,
  server: ServerState,
): "none" | "offer" | "discard" {
  if (!draft) return "none";
  if (draft.transcriptFingerprint !== server.transcriptFingerprint)
    return "discard";
  if (server.updatedAt !== null && draft.savedAt <= server.updatedAt)
    return "discard";
  return docKey(docOf(draft)) === docKey(server.doc) ? "discard" : "offer";
}
