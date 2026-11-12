import {
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineSummary, SegmentState } from "./pipeline";

const SEGMENT_NAMES: Record<PipelineSummary["segments"][number]["id"], string> =
  {
    ingest: "Persiapan video",
    transcribe: "Transkripsi",
    discover: "Pencarian klip",
    reframe: "Analisis wajah",
  };

const SEGMENT_STATE_LABELS: Record<SegmentState, string> = {
  done: "selesai",
  running: "berjalan",
  failed: "gagal",
  queued: "menunggu",
  pending: "belum mulai",
};

/**
 * Monokrom, dibedakan lewat nilai terang-gelap dan isian: selesai = charcoal penuh, berjalan =
 * charcoal sebagian, menunggu = abu penuh, belum = hanya trek. Merah hanya untuk gagal (galat).
 */
const FILL: Record<SegmentState, string> = {
  done: "bg-foreground",
  running: "bg-foreground",
  failed: "bg-destructive",
  queued: "bg-slate-mid",
  pending: "",
};

/** Empat segmen: persiapan video → transkripsi → pencarian klip → analisis wajah. */
export function PipelineBar({
  segments,
  className,
}: {
  segments: PipelineSummary["segments"];
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={segments
        .map((s) => `${SEGMENT_NAMES[s.id]}: ${SEGMENT_STATE_LABELS[s.state]}`)
        .join(", ")}
      className={cn("flex gap-1", className)}
    >
      {segments.map((segment) => (
        <div
          key={segment.id}
          title={`${SEGMENT_NAMES[segment.id]}: ${SEGMENT_STATE_LABELS[segment.state]}`}
          className="bg-border h-1.5 flex-1 overflow-hidden rounded-xs"
        >
          <div
            className={cn("h-full", FILL[segment.state])}
            style={{ width: `${segment.progress}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/** Ikon + teks status ("Transkripsi 47%", "Gagal di Analisis wajah", "Selesai", …); bentuk ikon yang membedakan status, bukan warna. */
export function PipelineStatusLabel({
  summary,
  className,
}: {
  summary: Pick<PipelineSummary, "status" | "label">;
  className?: string;
}) {
  const { icon, tone } = STATUS_STYLE[summary.status];
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-start gap-1.5 text-sm",
        tone,
        className,
      )}
    >
      {icon}
      <span className="tabular-nums">{summary.label}</span>
    </span>
  );
}

const ICON = "mt-0.5 size-4 shrink-0";

const STATUS_STYLE: Record<
  PipelineSummary["status"],
  { icon: React.ReactNode; tone: string }
> = {
  done: {
    icon: <CheckCircle2 className={ICON} aria-hidden />,
    tone: "text-foreground",
  },
  running: {
    icon: <Loader2 className={cn(ICON, "animate-spin")} aria-hidden />,
    tone: "text-foreground",
  },
  queued: {
    icon: <Clock className={ICON} aria-hidden />,
    tone: "text-muted-foreground",
  },
  failed: {
    icon: <XCircle className={ICON} aria-hidden />,
    tone: "text-destructive",
  },
  incomplete: {
    icon: <CircleDashed className={ICON} aria-hidden />,
    tone: "text-muted-foreground",
  },
  empty: {
    icon: <CircleDashed className={ICON} aria-hidden />,
    tone: "text-muted-foreground",
  },
};
