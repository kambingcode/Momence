import { useEffect } from "react";
import { removeDraft, writeDraft } from "./draft";
import { docKey, docOf, type EditorStore } from "./editor-store";

/** Jeda setelah perubahan terakhir sebelum draft ditulis. */
const AUTOSAVE_DELAY_MS = 400;

interface DraftAutosaveOptions {
  clipId: string;
  baseVersion: number | null;
  /** `docKey` isi yang tersimpan di server; draft dihapus bila dokumen sama dengannya. */
  savedKey: string;
  transcriptFingerprint: string;
  /** Mati selama dialog "Unsaved draft" belum dijawab, agar draft tidak tertimpa. */
  enabled: boolean;
}

/**
 * Tulis dokumen editor ke localStorage setiap kali berubah (jeda 400 ms, dipaksa saat tab
 * ditutup), atau hapus draft bila dokumen sama dengan versi server (setelah Save / undo).
 */
export function useDraftAutosave(
  store: EditorStore,
  {
    clipId,
    baseVersion,
    savedKey,
    transcriptFingerprint,
    enabled,
  }: DraftAutosaveOptions,
): void {
  useEffect(() => {
    if (!enabled) return;
    const sync = () => {
      const doc = docOf(store.getState());
      if (docKey(doc) === savedKey) {
        removeDraft(clipId);
        return;
      }
      writeDraft(clipId, {
        baseVersion,
        transcriptFingerprint,
        savedAt: Date.now(),
        removed: doc.removed.map((r) => ({ ...r, tokenIds: [...r.tokenIds] })),
        corrections: { ...doc.corrections },
        caption: doc.caption,
        reframe: doc.reframe,
        broll: [...doc.broll],
        textOverlays: [...doc.textOverlays],
      });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      sync();
    };
    const unsubscribe = store.subscribe((state, previous) => {
      if (
        state.removed === previous.removed &&
        state.corrections === previous.corrections &&
        state.caption === previous.caption &&
        state.reframe === previous.reframe &&
        state.broll === previous.broll &&
        state.textOverlays === previous.textOverlays
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
    });
    // Versi server berubah (Save berhasil): draft yang kini sama dengan server dihapus.
    if (docKey(docOf(store.getState())) === savedKey) removeDraft(clipId);

    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      unsubscribe();
      flush();
    };
  }, [store, clipId, baseVersion, savedKey, transcriptFingerprint, enabled]);
}
