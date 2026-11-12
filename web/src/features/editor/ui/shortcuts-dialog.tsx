"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogEyebrow,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { SHORTCUTS } from "./shortcuts";

/** Daftar pintasan keyboard editor (tombol di header atau tekan `?`); Esc menutup. */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogEyebrow>Tombol keyboard di header, atau tekan ?</DialogEyebrow>
        <DialogTitle>Pintasan keyboard</DialogTitle>
        <DialogDescription className="sr-only">
          Daftar pintasan keyboard di editor klip.
        </DialogDescription>
        <ul className="grid gap-x-8 sm:grid-cols-2">
          {SHORTCUTS.map(({ action, keys }) => (
            <li
              key={action}
              className="flex items-center justify-between gap-3 border-b py-2 text-sm"
            >
              {action}
              <span className="flex shrink-0 items-center gap-1">
                {keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Tutup</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
