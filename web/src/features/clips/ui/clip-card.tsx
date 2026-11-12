import { Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/features/projects/ui/format";
import { ExportButton } from "@/features/render/ui/export-button";
import { PostCopyButton } from "@/features/social/ui/post-copy-dialog";
import { cn } from "@/lib/utils";
import {
  type Clip,
  type SubscoreTier,
  subscoreTier,
} from "@/modules/clips/application";
import { buildTimeline } from "@/modules/editor/application";
import type { ClipSubscoreName } from "@/shared/schemas";
import { editorPath } from "../api";
import { ClipPlayer } from "./clip-player";

const SUBSCORES: { name: ClipSubscoreName; label: string }[] = [
  { name: "hook", label: "Hook" },
  { name: "flow", label: "Alur" },
  { name: "value", label: "Nilai" },
  { name: "trend", label: "Tren" },
];

/** Skor dari ambang ini diberi bingkai lavender (keputusan 2 Tahap 13). */
const HIGH_SCORE = 90;

/**
 * Tingkat nilai monokrom, dibedakan bentuk: A = isi charcoal, A- = garis charcoal, B = hairline,
 * C = hairline putus-putus dengan teks redup.
 */
const TIER_CLASSES: Record<SubscoreTier, string> = {
  A: "border-foreground bg-foreground text-background",
  "A-": "border-foreground text-foreground",
  B: "border-border text-foreground",
  C: "border-border border-dashed text-muted-foreground",
};

interface ClipCardProps {
  clip: Clip;
  /** `null` = video pratinjau belum siap (impor link: klip ditemukan selagi video diunduh). */
  videoSrc: string | null;
  aspectRatio: string;
  active: boolean;
  onPlay: () => void;
}

/**
 * Kartu klip: pratinjau di atas, lalu skor + judul + rentang waktu, hook, empat nilai, dan aksi
 * (Edit = aksi utama, Caption & hashtag, Export).
 */
export function ClipCard({
  clip,
  videoSrc,
  aspectRatio,
  active,
  onPlay,
}: ClipCardProps) {
  const { details } = clip;
  const timeline = useMemo(() => buildTimeline([], new Set(), clip), [clip]);
  const high = clip.score != null && clip.score >= HIGH_SCORE;
  return (
    <article
      aria-label={clip.title}
      className="bg-card flex flex-col overflow-hidden rounded-xl border"
    >
      <div className="p-3 pb-0">
        {videoSrc ? (
          <ClipPlayer
            src={videoSrc}
            timeline={timeline}
            title={clip.title}
            aspectRatio={aspectRatio}
            active={active}
            onPlay={onPlay}
          />
        ) : (
          <div
            className="bg-secondary text-muted-foreground flex items-center justify-center rounded-lg px-3 text-center text-sm"
            style={{ aspectRatio }}
          >
            Video masih diunduh; pratinjau tersedia setelah selesai.
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-12 shrink-0 flex-col items-center justify-center rounded-lg border leading-none",
              high ? "border-primary-soft border-2" : "border-border",
            )}
            title={
              clip.rank != null
                ? `Skor ${clip.score ?? "–"} · peringkat ${clip.rank}`
                : "Belum dinilai"
            }
          >
            <span className="text-lg font-medium tabular-nums">
              {clip.score ?? "–"}
            </span>
            {clip.rank != null && (
              <span className="label-mono text-muted-foreground mt-0.5 text-[11px]">
                #{clip.rank}
              </span>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-base leading-snug font-medium">{clip.title}</h3>
            <p className="label-mono text-muted-foreground text-xs tabular-nums">
              {formatDuration(clip.startMs)}–{formatDuration(clip.endMs)} ·{" "}
              {formatDuration(clip.endMs - clip.startMs)}
            </p>
          </div>
        </div>

        {details.hook && (
          <p className="text-muted-foreground border-l-2 pl-3 text-sm italic">
            “{details.hook}”
          </p>
        )}

        <dl className="space-y-2.5">
          {SUBSCORES.map(({ name, label }) => {
            const { score, comment } = details.subscores[name];
            const tier = subscoreTier(score);
            return (
              <div key={name} className="flex items-start gap-3 text-sm">
                <dt className="flex w-20 shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "label-mono inline-flex h-5 w-7 items-center justify-center rounded-xs border text-xs",
                      TIER_CLASSES[tier],
                    )}
                    title={`${score}/10`}
                  >
                    {tier}
                  </span>
                  <span>{label}</span>
                </dt>
                <dd className="text-muted-foreground min-w-0">
                  {comment || `${score}/10`}
                </dd>
              </div>
            );
          })}
        </dl>

        <div className="mt-auto flex flex-wrap gap-2 border-t pt-4">
          <Button size="sm" asChild>
            <Link href={editorPath(clip.projectId, clip.id)}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </Button>
          <PostCopyButton clipId={clip.id} clipTitle={clip.title} />
          <ExportButton
            clipId={clip.id}
            disabledReason={
              videoSrc
                ? null
                : "Video sumber masih diunduh/disiapkan; export bisa setelah selesai."
            }
          />
        </div>
      </div>
    </article>
  );
}
