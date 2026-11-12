import { Scissors } from "lucide-react";
import Link from "next/link";
import { clipsPath } from "@/features/clips/api";
import { RetryJobButton } from "@/features/jobs/ui/retry-job-button";
import type {
  ProjectListItem,
  StorageUsage,
} from "@/modules/projects/application";
import { formatBytes, formatRelativeTime } from "./format";
import { PipelineBar, PipelineStatusLabel } from "./pipeline-bar";
import { summarizePipeline } from "./pipeline";
import { ProjectMenu, ScorePill } from "./project-menu";
import { ProjectThumbnail } from "./project-thumbnail";

/**
 * Kartu grid proyek: thumbnail besar (radius kartu, lencana durasi & jumlah klip), judul 500, dan
 * satu baris keterangan. Seluruh kartu adalah satu tautan ke tujuan utama (klip bila sudah ada,
 * selain itu transkrip/progres) lewat pola *stretched link*; menu "…" dan "Coba lagi" berada di
 * atasnya (`relative z-10`) sehingga tidak ada elemen interaktif bersarang.
 */
export function ProjectCard({
  project,
  storage,
}: {
  project: ProjectListItem;
  /** Pemakaian disk proyek; `undefined` selama belum termuat. */
  storage?: StorageUsage;
}) {
  const { source } = project;
  const summary = summarizePipeline(project.jobs);
  const discovered = project.jobs.some(
    (job) => job.type === "discover" && job.status === "done",
  );
  const { count, bestScore } = project.clips;
  const href = discovered ? clipsPath(project.id) : `/projects/${project.id}`;
  const size = storage?.total ?? (source?.sizeBytes || null);
  const details = [
    discovered ? `${count} klip` : null,
    size != null ? formatBytes(size) : null,
    formatRelativeTime(project.updatedAt),
  ].filter(Boolean);
  const showStatus = summary.status !== "done";

  return (
    <article className="group relative flex flex-col gap-3">
      <div className="bg-secondary shadow-subtle-3 relative overflow-hidden rounded-xl">
        <ProjectThumbnail
          projectId={project.id}
          hasProxy={Boolean(source?.proxyPath)}
          durationMs={source?.durationMs}
          size="lg"
          className="aspect-video w-full transition-opacity duration-150 group-hover:opacity-90"
        />
        {discovered && count > 0 && (
          <span className="label-mono bg-background/90 absolute top-2 left-2 inline-flex items-center gap-1 rounded-xs px-1.5 text-xs leading-5">
            <Scissors className="size-3" aria-hidden />
            {count} klip
          </span>
        )}
      </div>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-base leading-snug font-medium">
            <Link
              href={href}
              title={project.name}
              className="focus-visible:after:ring-ring/40 line-clamp-2 outline-none group-hover:underline after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3"
            >
              {project.name}
            </Link>
          </h3>
          <div className="flex min-w-0 items-center gap-2">
            {bestScore != null && (
              <ScorePill
                score={bestScore}
                label="Skor terbaik"
                className="h-5"
              />
            )}
            <p
              className="text-muted-foreground truncate text-sm"
              title={new Date(project.updatedAt).toLocaleString("id-ID")}
            >
              {details.join(" · ")}
            </p>
          </div>
        </div>
        <ProjectMenu
          project={project}
          storage={storage}
          discovered={discovered}
          className="relative z-10 -mt-1 -mr-2"
        />
      </div>

      {showStatus && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <PipelineStatusLabel summary={summary} />
            {summary.failedJob && (
              <span className="relative z-10">
                <RetryJobButton job={summary.failedJob} />
              </span>
            )}
          </div>
          <PipelineBar segments={summary.segments} />
          {summary.failedJob?.error && (
            <p className="text-destructive line-clamp-2 text-xs break-words">
              {summary.failedJob.error}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
