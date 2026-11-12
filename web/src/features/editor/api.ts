import { errorMessage } from "@/features/projects/api";
import type {
  ClipEditorData,
  StoredEditingScript,
} from "@/modules/editor/application";
import type { SaveEditingScriptBody } from "@/shared/schemas";

export const editorQueryKey = (clipId: string) =>
  ["clips", clipId, "editor"] as const;

const scriptUrl = (clipId: string) =>
  `/api/clips/${encodeURIComponent(clipId)}`;

export class ClipNotFoundError extends Error {
  constructor() {
    super("Klip tidak ditemukan.");
    this.name = "ClipNotFoundError";
  }
}

export async function fetchClipEditor(clipId: string): Promise<ClipEditorData> {
  const response = await fetch(scriptUrl(clipId), { cache: "no-store" });
  if (response.status === 404) throw new ClipNotFoundError();
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as ClipEditorData;
}

export type SaveResponse =
  | { status: "saved"; editingScript: StoredEditingScript }
  /** Disimpan dari tempat lain; `current` = versi terkini di server. */
  | { status: "conflict"; message: string; current: StoredEditingScript | null }
  /** Transkrip klip berubah sejak editor dibuka. */
  | { status: "stale"; message: string };

/** 409 dikembalikan sebagai hasil; kegagalan lain dilempar sebagai Error. */
export async function saveEditingScript(
  clipId: string,
  body: SaveEditingScriptBody,
): Promise<SaveResponse> {
  const response = await fetch(`${scriptUrl(clipId)}/editing-script`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 409) {
    const conflict = (await response.json()) as {
      error: string;
      current?: StoredEditingScript | null;
    };
    return conflict.current === undefined
      ? { status: "stale", message: conflict.error }
      : {
          status: "conflict",
          message: conflict.error,
          current: conflict.current,
        };
  }
  if (!response.ok) throw new Error(await errorMessage(response));
  const saved = (await response.json()) as {
    editingScript: StoredEditingScript;
  };
  return { status: "saved", editingScript: saved.editingScript };
}
