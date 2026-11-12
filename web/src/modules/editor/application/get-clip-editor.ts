import type { Clip } from "@/modules/clips/application";
import type { CropTracks } from "@/shared/schemas";
import {
  type ClipSource,
  type ClipTokens,
  loadClipTokens,
  type TranscriptSource,
} from "./load-clip-tokens";
import type { EditingScriptRepository, StoredEditingScript } from "./ports";

export interface CropTracksSource {
  execute(clip: Clip): Promise<CropTracks | null>;
}

export interface ClipEditorData extends ClipTokens {
  editingScript: StoredEditingScript | null;
  /** EditingScript disimpan untuk transkrip lain (transkripsi ulang) → rujukan tokennya usang. */
  stale: boolean;
  /** Jalur crop auto-reframe per rasio; `null` = belum dianalisis (crop tengah). */
  cropTracks: CropTracks | null;
}

/** Data untuk membuka editor klip; `null` bila klip tidak ada. */
export class GetClipEditor {
  constructor(
    private readonly clips: ClipSource,
    private readonly transcripts: TranscriptSource,
    private readonly scripts: Pick<EditingScriptRepository, "get">,
    private readonly cropTracks: CropTracksSource,
  ) {}

  async execute(clipId: string): Promise<ClipEditorData | null> {
    const loaded = await loadClipTokens(this.clips, this.transcripts, clipId);
    if (!loaded) return null;
    const [editingScript, cropTracks] = await Promise.all([
      this.scripts.get(clipId),
      this.cropTracks.execute(loaded.clip),
    ]);
    return {
      ...loaded,
      editingScript,
      cropTracks,
      stale:
        editingScript !== null &&
        editingScript.script.transcriptFingerprint !==
          loaded.transcriptFingerprint,
    };
  }
}
