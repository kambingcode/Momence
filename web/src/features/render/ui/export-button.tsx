"use client";

import { Download, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { renderOutputUrl } from "../api";
import { useClipRender } from "./use-clip-render";

interface ExportButtonProps {
  clipId: string;
  /** Alasan render baru belum bisa dimulai (mis. video sumber masih diunduh); `null` = bisa. */
  disabledReason?: string | null;
}

/**
 * Export klip ke MP4 (daftar klip): antre job render, tampilkan progresnya, lalu tautan Unduh MP4.
 * Render memakai EditingScript yang tersimpan. Editor punya kontrol sendiri di headernya.
 */
export function ExportButton({ clipId, disabledReason }: ExportButtonProps) {
  const { phase, start } = useClipRender(clipId);

  const exportButton = (label: string, icon: React.ReactNode) => (
    <Button
      variant="outline"
      size="sm"
      onClick={start}
      disabled={phase.kind === "starting" || Boolean(disabledReason)}
      title={disabledReason ?? "Render klip (dengan editan tersimpan) ke MP4"}
    >
      {phase.kind === "starting" ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {label}
    </Button>
  );

  if (phase.kind === "failed")
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span
          role="alert"
          className="text-destructive max-w-xs text-xs break-words"
        >
          Export gagal: {phase.message}
        </span>
        {exportButton("Coba lagi", <RotateCcw aria-hidden />)}
      </span>
    );

  if (phase.kind === "queued" || phase.kind === "running")
    return (
      <span
        className="flex min-w-40 items-center gap-2 text-sm"
        aria-live="polite"
      >
        <Loader2
          className="text-primary size-4 shrink-0 animate-spin"
          aria-hidden
        />
        {phase.kind === "queued" ? (
          <span
            className="text-muted-foreground"
            title="Jalankan `uv run worker run` bila tidak bergerak"
          >
            Menunggu worker…
          </span>
        ) : (
          <>
            <Progress
              value={phase.progress}
              className="w-24"
              aria-label={`Render ${phase.progress}%`}
            />
            <span className="tabular-nums">{phase.progress}%</span>
          </>
        )}
      </span>
    );

  if (phase.kind === "done")
    return (
      <span className="flex items-center gap-2">
        <Button size="sm" asChild>
          <a href={renderOutputUrl(phase.job.id)} download>
            <Download aria-hidden />
            Unduh MP4
          </a>
        </Button>
        {exportButton("Render ulang", <RotateCcw aria-hidden />)}
      </span>
    );

  return exportButton("Export", <Download aria-hidden />);
}
