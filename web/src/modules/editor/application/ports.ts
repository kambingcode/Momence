import type { EditingScript } from "@/shared/schemas/editing-script";

export interface StoredEditingScript {
  clipId: string;
  /** Naik 1 tiap Save; dipakai untuk deteksi konflik (mis. dua tab). */
  version: number;
  script: EditingScript;
  /** Epoch milidetik. */
  updatedAt: number;
}

export type SaveScriptOutcome =
  | { status: "saved"; saved: StoredEditingScript }
  | { status: "conflict"; current: StoredEditingScript | null };

export interface EditingScriptRepository {
  get(clipId: string): Promise<StoredEditingScript | null>;
  /**
   * Simpan utuh secara atomik bila versi tersimpan sama dengan `expectedVersion`
   * (`null` = belum pernah disimpan); selain itu `conflict` dengan versi terkini.
   */
  save(
    clipId: string,
    script: EditingScript,
    expectedVersion: number | null,
  ): Promise<SaveScriptOutcome>;
}
