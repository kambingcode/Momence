"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogEyebrow,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRelativeTime } from "@/features/projects/ui/format";
import type { Draft } from "./draft";

/** Props agar dialog keputusan tidak bisa ditutup tanpa memilih (Esc / klik di luar). */
export const MUST_DECIDE = {
  onEscapeKeyDown: (event: Event) => event.preventDefault(),
  onInteractOutside: (event: Event) => event.preventDefault(),
} as const;

/** "Unsaved draft": lanjutkan editan yang belum disimpan dari sesi sebelumnya, atau buang. */
export function DraftDialog({
  draft,
  onContinue,
  onDiscard,
}: {
  draft: Draft;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog open>
      <DialogContent {...MUST_DECIDE}>
        <DialogEyebrow>Saat membuka klip dengan draft lokal</DialogEyebrow>
        <DialogTitle>Lanjutkan editan yang belum disimpan?</DialogTitle>
        <DialogDescription>
          Ada draft di komputer ini dari{" "}
          <span className="text-foreground">
            {formatRelativeTime(draft.savedAt)}
          </span>
          . Lanjutkan editan itu, atau buang dan buka versi yang tersimpan?
        </DialogDescription>
        <DialogFooter>
          <Button variant="outline" onClick={onDiscard}>
            Buang draft
          </Button>
          <Button onClick={onContinue}>Lanjutkan editan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
