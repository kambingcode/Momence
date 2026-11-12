"use client";

import { Check, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "none";

/**
 * Status simpan: gagal › menyimpan › belum disimpan › tersimpan. `none` = klip belum pernah
 * disimpan dan belum diubah (tidak ada yang ditampilkan).
 */
export function saveStatusOf(input: {
  saving: boolean;
  failed: boolean;
  dirty: boolean;
  everSaved: boolean;
}): SaveStatus {
  if (input.saving) return "saving";
  if (input.failed) return "error";
  if (input.dirty) return "unsaved";
  return input.everSaved ? "saved" : "none";
}

/** Status + tombol Simpan. Lebar status & tombol tetap di semua keadaan (tanpa lompatan layout). */
export function SaveControls({
  status,
  onSave,
}: {
  status: SaveStatus;
  onSave: () => void;
}) {
  const retry = status === "error";
  const canSave = status === "unsaved" || retry;
  return (
    <div className="flex items-center gap-3">
      <p
        className="text-muted-foreground flex items-center sm:min-w-36 max-sm:sr-only justify-end gap-1.5 text-sm whitespace-nowrap"
        aria-live="polite"
      >
        {status === "saving" && (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Menyimpan…
          </>
        )}
        {status === "unsaved" && (
          <>
            <span className="bg-foreground size-1.5 rounded-full" aria-hidden />
            <span className="text-foreground">Belum disimpan</span>
          </>
        )}
        {status === "saved" && (
          <>
            <Check className="size-4" aria-hidden />
            Tersimpan
          </>
        )}
        {status === "error" && (
          <span className="text-destructive flex items-center gap-1.5">
            <CircleAlert className="size-4" aria-hidden />
            Gagal menyimpan
          </span>
        )}
      </p>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              variant="outline"
              size="sm"
              className="min-w-24"
              onClick={onSave}
              disabled={!canSave}
            >
              {retry ? "Coba simpan" : "Simpan"}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Simpan
          <Kbd>⌘S</Kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
