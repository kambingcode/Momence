"use client";

import { RotateCcw, Scissors } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  removedIdSet,
  restoreTargets,
  transcriptStats,
} from "@/modules/editor/application";
import type { TranscriptToken } from "@/shared/schemas/transcript";
import { useEditor } from "./editor-store";
import { useCutSelection } from "./use-cut-selection";

/**
 * Tombol yang baru saja dinonaktifkan (tak ada seleksi/pemulihan tersisa) membuat fokus hilang ke
 * `body`; kembalikan ke teks transkrip agar pengetikan & panah berlanjut.
 */
const refocusTranscript = (from: HTMLElement) =>
  from
    .closest("section")
    ?.querySelector<HTMLElement>('[role="textbox"]')
    ?.focus({ preventScroll: true });

/** Kepala panel transkrip: judul + hitungan, sembunyikan terpotong, Potong & Pulihkan. */
export function TranscriptToolbar({
  tokens,
  hideRemoved,
  onHideRemovedChange,
}: {
  tokens: readonly TranscriptToken[];
  hideRemoved: boolean;
  onHideRemovedChange: (hide: boolean) => void;
}) {
  const cursor = useEditor((s) => s.cursor);
  const removed = useEditor((s) => s.removed);
  const restoreTokens = useEditor((s) => s.restoreTokens);
  const removedIds = useMemo(() => removedIdSet(removed), [removed]);
  const stats = useMemo(
    () => transcriptStats(tokens, removedIds),
    [tokens, removedIds],
  );
  // Potong = Backspace/Delete pada seleksi (hook yang sama dengan toolbar mengambang).
  const { cuttable, cut } = useCutSelection(tokens);
  const restorable = useMemo(
    () =>
      restoreTargets(cursor, tokens.length, (i) =>
        removedIds.has(tokens[i]!.id),
      ).map((i) => tokens[i]!.id),
    [cursor, tokens, removedIds],
  );

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-base font-medium">Transkrip</h2>
        <p className="label-mono text-muted-foreground tabular-nums">
          {stats.words} kata · {stats.removedWords} terpotong
        </p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <Checkbox
            checked={hideRemoved}
            onCheckedChange={(checked) => onHideRemovedChange(checked === true)}
          />
          Sembunyikan bagian terpotong
        </label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              cut();
              refocusTranscript(event.currentTarget);
            }}
            disabled={cuttable.length === 0}
            title="Potong seleksi (Backspace/Delete)"
          >
            <Scissors aria-hidden />
            Potong
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              restoreTokens(restorable);
              refocusTranscript(event.currentTarget);
            }}
            disabled={restorable.length === 0}
            title="Pulihkan bagian terpotong di kursor atau seleksi (seluruh grupnya)"
          >
            <RotateCcw aria-hidden />
            Pulihkan
          </Button>
        </div>
      </div>
    </div>
  );
}
