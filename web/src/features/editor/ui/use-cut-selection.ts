import { useCallback, useMemo } from "react";
import {
  collapsedAt,
  removedIdSet,
  selectedRange,
} from "@/modules/editor/application";
import type { TranscriptToken } from "@/shared/schemas/transcript";
import { useEditor } from "./editor-store";

/**
 * Potong seleksi kursor (sama dengan Backspace/Delete pada seleksi): hanya token terseleksi yang
 * belum terpotong, satu grup potongan; kursor menciut ke awal seleksi. Dipakai tombol Potong di
 * kepala panel dan toolbar mengambang di atas seleksi.
 */
export function useCutSelection(tokens: readonly TranscriptToken[]) {
  const cursor = useEditor((s) => s.cursor);
  const removed = useEditor((s) => s.removed);
  const setCursor = useEditor((s) => s.setCursor);
  const removeTokens = useEditor((s) => s.removeTokens);
  const removedIds = useMemo(() => removedIdSet(removed), [removed]);
  const range = useMemo(() => selectedRange(cursor), [cursor]);
  const cuttable = useMemo(
    () =>
      range
        ? tokens
            .slice(range[0], range[1])
            .filter((token) => !removedIds.has(token.id))
        : [],
    [tokens, removedIds, range],
  );
  const cut = useCallback(() => {
    if (!range || cuttable.length === 0) return;
    removeTokens(cuttable.map((token) => token.id));
    setCursor(collapsedAt(range[0]));
  }, [range, cuttable, removeTokens, setCursor]);
  return { range, cuttable, cut };
}
