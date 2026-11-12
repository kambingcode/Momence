"use client";

import { FileText, Scissors } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { clipsPath } from "@/features/clips/api";
import { RetryJobButton } from "@/features/jobs/ui/retry-job-button";
import type {
  ProjectListItem,
  StorageUsage,
} from "@/modules/projects/application";
import { cn } from "@/lib/utils";
import { formatBytes, formatDuration, formatRelativeTime } from "./format";
import { PipelineBar, PipelineStatusLabel } from "./pipeline-bar";
import { ProjectMenu, ScorePill } from "./project-menu";
import { summarizePipeline, type PipelineSummary } from "./pipeline";
import { ProjectThumbnail } from "./project-thumbnail";

/**
 * Kolom aksi selebar tetap supaya kolom antarbaris sejajar (tiap baris adalah grid sendiri).
 * Kolom tabel per lebar layar: Ukuran/Diubah muncul mulai `lg`, Klip/Skor mulai `md`, kolom
 * Proyek/Status/aksi mulai `sm`; di bawah `sm` baris bertumpuk. Header & sel memakai kelas yang
 * sama supaya kolomnya sejajar.
 */
const ROW_GRID =
  "sm:grid sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_10.5rem] sm:gap-x-4 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_3rem_4.5rem_10.5rem] lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_3rem_4.5rem_5.5rem_9rem_10.5rem]";

const ROW_TINT: Record<PipelineSummary["tone"], string> = {
  idle: "",
  running: "bg-secondary",
  failed: "bg-destructive/[0.05]",
};

export function ProjectTable({
  projects,
  storage,
  footer,
}: {
  projects: ProjectListItem[];
  /** Pemakaian disk per proyek (kunci = id proyek); kosong selama belum termuat. */
  storage: Record<string, StorageUsage> | undefined;
  footer: React.ReactNode;
}) {
  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      <div role="table" aria-label="Daftar proyek">
        <div role="rowgroup">
          <div
            role="row"
            className={cn(
              "label-mono text-muted-foreground hidden items-center border-b px-4 py-2.5 uppercase",
              ROW_GRID,
            )}
          >
            <div role="columnheader">Proyek</div>
            <div role="columnheader">Status</div>
            <div role="columnheader" className="hidden md:block">
              Klip
            </div>
            <div role="columnheader" className="hidden md:block">
              Skor
            </div>
            <div role="columnheader" className="hidden lg:block">
              Ukuran
            </div>
            <div role="columnheader" className="hidden lg:block">
              Diubah
            </div>
            <div role="columnheader" className="sr-only">
              Aksi
            </div>
          </div>
        </div>
        <div role="rowgroup" className="divide-border divide-y">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              storage={storage?.[project.id]}
            />
          ))}
        </div>
      </div>
      <div className="label-mono text-muted-foreground border-t px-4 py-2.5">
        {footer}
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  storage,
}: {
  project: ProjectListItem;
  storage?: StorageUsage;
}) {
  const { source } = project;
  const summary = summarizePipeline(project.jobs);
  const done = (type: string) =>
    project.jobs.some((job) => job.type === type && job.status === "done");
  const transcribed = done("transcribe");
  const discovered = done("discover");
  // Seluruh folder proyek; 0 selama video dari link belum terunduh.
  const size = storage?.total ?? (source?.sizeBytes || null);
  const { count, bestScore } = project.clips;
  const subtitle = [
    source?.durationMs != null ? formatDuration(source.durationMs) : null,
    source?.width && source.height ? `${source.width}×${source.height}` : null,
  ].filter(Boolean);
  // Kolom yang disembunyikan di layar sempit pindah ke baris keterangan.
  const compact = [
    count > 0 ? `${count} klip` : null,
    size != null ? formatBytes(size) : null,
    formatRelativeTime(project.updatedAt),
  ].filter(Boolean);

  return (
    <div
      role="row"
      className={cn(
        "flex flex-col gap-2 px-4 py-3 sm:items-center",
        ROW_GRID,
        ROW_TINT[summary.tone],
      )}
    >
      <div role="cell" className="flex min-w-0 items-center gap-3">
        <ProjectThumbnail
          projectId={project.id}
          hasProxy={Boolean(source?.proxyPath)}
          durationMs={source?.durationMs}
          className="h-11 w-[4.75rem]"
        />
        <div className="min-w-0">
          <Link
            href={`/projects/${project.id}`}
            title={project.name}
            className="block truncate text-sm hover:underline"
          >
            {project.name}
          </Link>
          <p className="text-muted-foreground truncate text-xs">
            {subtitle.join(" · ")}
            <span className="lg:hidden">
              {subtitle.length > 0 && compact.length > 0 ? " · " : ""}
              {compact.join(" · ")}
            </span>
          </p>
        </div>
      </div>

      <div
        role="cell"
        className="min-w-0 space-y-1.5"
        title={summary.failedJob?.error ?? undefined}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <PipelineStatusLabel summary={summary} />
          {summary.failedJob && <RetryJobButton job={summary.failedJob} />}
        </div>
        <PipelineBar segments={summary.segments} />
      </div>

      <div role="cell" className="label-mono tabular-nums max-md:hidden">
        {count > 0 ? count : <Dash />}
      </div>
      <div role="cell" className="max-md:hidden">
        {bestScore == null ? <Dash /> : <ScorePill score={bestScore} />}
      </div>
      <div
        role="cell"
        className="label-mono text-muted-foreground tabular-nums max-lg:hidden"
      >
        {size != null ? formatBytes(size) : <Dash />}
      </div>
      <div
        role="cell"
        className="label-mono text-muted-foreground truncate max-lg:hidden"
        title={new Date(project.updatedAt).toLocaleString("id-ID")}
      >
        {formatRelativeTime(project.updatedAt)}
      </div>

      <div
        role="cell"
        className="flex flex-wrap items-center gap-1 sm:flex-nowrap sm:justify-end"
      >
        {transcribed && (
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="text-muted-foreground size-8"
          >
            <Link
              href={`/projects/${project.id}`}
              aria-label="Lihat transkrip"
              title="Lihat transkrip"
            >
              <FileText className="size-4" aria-hidden />
            </Link>
          </Button>
        )}
        {discovered && (
          <Button asChild size="sm">
            <Link href={clipsPath(project.id)}>
              <Scissors className="size-3.5" aria-hidden />
              Lihat klip
            </Link>
          </Button>
        )}
        <ProjectMenu
          project={project}
          storage={storage}
          discovered={discovered}
        />
      </div>
    </div>
  );
}

function Dash() {
  return (
    <span className="text-muted-foreground" aria-label="tidak ada">
      –
    </span>
  );
}
