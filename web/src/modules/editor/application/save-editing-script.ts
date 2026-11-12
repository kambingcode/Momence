import type { SaveEditingScriptBody } from "@/shared/schemas/editing-script";
import { tokenEditsProblem } from "../domain/script-rules";
import {
  type ClipSource,
  loadClipTokens,
  type TranscriptSource,
} from "./load-clip-tokens";
import type { EditingScriptRepository, StoredEditingScript } from "./ports";

export type SaveEditingScriptResult =
  | { status: "saved"; editingScript: StoredEditingScript }
  | { status: "not_found" }
  /** Transkrip klip berubah sejak editor dibuka; muat ulang editor. */
  | { status: "stale" }
  | { status: "invalid"; message: string }
  /** Sudah disimpan dari tempat lain (versi berbeda). */
  | { status: "conflict"; current: StoredEditingScript | null };

/** Simpan EditingScript utuh (bukan patch) dengan pemeriksaan versi & rujukan token. */
export class SaveEditingScript {
  constructor(
    private readonly clips: ClipSource,
    private readonly transcripts: TranscriptSource,
    private readonly scripts: Pick<EditingScriptRepository, "save">,
  ) {}

  async execute(
    clipId: string,
    body: SaveEditingScriptBody,
  ): Promise<SaveEditingScriptResult> {
    const loaded = await loadClipTokens(this.clips, this.transcripts, clipId);
    if (!loaded) return { status: "not_found" };
    if (body.transcriptFingerprint !== loaded.transcriptFingerprint)
      return { status: "stale" };
    const problem = tokenEditsProblem(body.script, loaded.tokens);
    if (problem) return { status: "invalid", message: problem };

    const outcome = await this.scripts.save(
      clipId,
      { ...body.script, transcriptFingerprint: loaded.transcriptFingerprint },
      body.baseVersion,
    );
    return outcome.status === "saved"
      ? { status: "saved", editingScript: outcome.saved }
      : outcome;
  }
}
