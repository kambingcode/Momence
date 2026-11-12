"use client";

import { CircleX, Download, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { renderOutputUrl } from "@/features/render/api";
import { formatEta, renderEtaMs } from "@/features/render/ui/eta";
import { useClipRender } from "@/features/render/ui/use-clip-render";
import { formatBytes } from "@/features/projects/ui/format";

const PILL =
  "relative inline-flex h-8 min-w-40 items-center justify-center gap-1.5 overflow-hidden rounded-3xl border-[1.5px] border-foreground px-4 text-sm whitespace-nowrap";

/**
 * Export di header: Export (satu-satunya tombol berisi penuh) → progres → Unduh MP4 + Render
 * ulang, atau pesan singkat "Render gagal" + Coba lagi (detail ke toast). `disabledReason`
 * hanya mengunci aksi yang memulai render; unduhan & progres tetap tampil.
 */
export function ExportControl({
  clipId,
  disabledReason,
  summary,
}: {
  clipId: string;
  /** Alasan render baru tidak bisa dimulai sekarang (mis. editan belum disimpan). */
  disabledReason: string | null;
  /** Ringkasan hasil untuk toast sukses, mis. "0:47 · 1080×1920". */
  summary: string;
}) {
  const { phase, start } = useClipRender(clipId);
  const { toast, dismiss } = useToast();
  const toastId = useRef<string | null>(null);

  const kind = phase.kind;
  const failureMessage = phase.kind === "failed" ? phase.message : null;
  const doneJobId = phase.kind === "done" ? phase.job.id : null;
  const doneSize =
    phase.kind === "done"
      ? (phase.job.result as { sizeBytes?: unknown } | null)?.sizeBytes
      : undefined;
  // Ringkasan hanya dibaca saat render selesai; perubahan editan sesudahnya tidak memunculkan toast lagi.
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  useEffect(() => {
    if (toastId.current && kind === "starting") {
      dismiss(toastId.current);
      toastId.current = null;
    }
  }, [kind, dismiss]);
  useEffect(() => {
    if (failureMessage === null) return;
    toastId.current = toast({
      key: "render",
      variant: "error",
      title: "Render gagal.",
      description: failureMessage,
      actions: [
        { label: "Coba lagi", onClick: start },
        {
          label: "Salin detail error",
          onClick: () => void navigator.clipboard?.writeText(failureMessage),
        },
      ],
    });
  }, [failureMessage, toast, start]);
  useEffect(() => {
    if (doneJobId === null) return;
    const size =
      typeof doneSize === "number" ? ` · ${formatBytes(doneSize)}` : "";
    toastId.current = toast({
      key: "render",
      variant: "success",
      title: `MP4 siap · ${summaryRef.current}${size}`,
      actions: [
        {
          label: "Unduh",
          onClick: () => window.location.assign(renderOutputUrl(doneJobId)),
        },
      ],
    });
  }, [doneJobId, doneSize, toast]);

  const startButton = (
    label: string,
    options: {
      variant: "default" | "outline" | "ghost";
      icon: React.ReactNode;
    },
  ) => {
    const locked = disabledReason !== null;
    const button = (
      <Button
        variant={locked ? "outline" : options.variant}
        size="sm"
        className={locked ? "border-border border-dashed" : undefined}
        onClick={start}
        disabled={locked}
      >
        {options.icon}
        {label}
      </Button>
    );
    if (!locked) return button;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    );
  };

  if (phase.kind === "starting")
    return (
      <Button size="sm" disabled className="min-w-28">
        <Loader2 className="animate-spin" aria-hidden />
        Export
      </Button>
    );

  if (phase.kind === "queued")
    return (
      <span
        className={PILL}
        aria-live="polite"
        title="Jalankan `uv run worker run` bila tidak bergerak"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Menunggu worker…
      </span>
    );

  if (phase.kind === "running") {
    const eta = formatEta(
      renderEtaMs(phase.job.startedAt, phase.progress, phase.job.updatedAt),
    );
    return (
      <span
        role="progressbar"
        aria-label={`Render ${phase.progress}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={phase.progress}
        className={PILL}
      >
        <span
          className="bg-primary-soft absolute inset-y-0 left-0 transition-[width]"
          style={{ width: `${phase.progress}%` }}
          aria-hidden
        />
        <span className="relative tabular-nums">Render {phase.progress}%</span>
        {eta && (
          <span className="text-muted-foreground relative font-mono text-xs">
            {eta}
          </span>
        )}
      </span>
    );
  }

  if (phase.kind === "done")
    return (
      <span className="flex items-center gap-2">
        {startButton("Render ulang", {
          variant: "ghost",
          icon: <RotateCcw aria-hidden />,
        })}
        <Button size="sm" asChild>
          <a href={renderOutputUrl(phase.job.id)} download>
            <Download aria-hidden />
            Unduh MP4
          </a>
        </Button>
      </span>
    );

  if (phase.kind === "failed")
    return (
      <span className="flex items-center gap-2">
        <span
          className="text-destructive flex items-center gap-1.5 text-sm whitespace-nowrap"
          role="status"
        >
          <CircleX className="size-4" aria-hidden />
          Render gagal
        </span>
        {startButton("Coba lagi", {
          variant: "outline",
          icon: null,
        })}
      </span>
    );

  return startButton("Export MP4", {
    variant: "default",
    icon: <Download aria-hidden />,
  });
}
