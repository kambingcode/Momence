"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkerBanner } from "@/features/jobs/ui/worker-banner";
import {
  PROJECT_LIST_LIMIT,
  type ProjectListItem,
  type StorageUsage,
} from "@/modules/projects/application";
import {
  fetchProjects,
  fetchStorage,
  projectsQueryKey,
  storageQueryKey,
} from "../api";
import { describeProjectCount, filterAndSortProjects } from "./filter-sort";
import { formatBytes } from "./format";
import { ProjectCard } from "./project-card";
import { ProjectTable } from "./project-table";
import { ProjectToolbar } from "./project-toolbar";
import { QuickActions } from "./quick-actions";
import { useProjectViewPreferences } from "./view-preferences";

/** Polling cepat saat ada job berjalan, lebih jarang bila hanya menunggu, berhenti bila semua selesai. */
function pollInterval(statuses: string[]): number | false {
  if (statuses.includes("running")) return 1000;
  if (statuses.includes("queued")) return 2000;
  return false;
}

/** "Menampilkan 2 dari 6 proyek · 1,2 GB"; ukuran baru muncul setelah pemakaian disk termuat. */
function footerText(
  shown: ProjectListItem[],
  total: number,
  storage: Record<string, StorageUsage> | undefined,
): string {
  const text = describeProjectCount({
    shown: shown.length,
    total,
    limit: PROJECT_LIST_LIMIT,
  });
  if (!storage) return text;
  const bytes = shown.reduce((sum, p) => sum + (storage[p.id]?.total ?? 0), 0);
  return `${text} · ${formatBytes(bytes)}`;
}

export function ProjectDashboard() {
  const projects = useQuery({
    queryKey: projectsQueryKey,
    queryFn: fetchProjects,
    refetchInterval: (query) =>
      pollInterval(
        (query.state.data ?? []).flatMap((p) => p.jobs.map((j) => j.status)),
      ),
  });
  const busy = (projects.data ?? []).some((p) =>
    p.jobs.some((j) => j.status === "queued" || j.status === "running"),
  );
  // Ukuran file berubah selama job berjalan (proxy, render); selain itu cukup saat diminta.
  const storage = useQuery({
    queryKey: storageQueryKey,
    queryFn: fetchStorage,
    refetchInterval: busy ? 10_000 : false,
  });
  const { view, setView, sort, setSort } = useProjectViewPreferences();
  const [query, setQuery] = useState("");

  const storageByProject = storage.data?.projects;
  const all = projects.data;
  const visible = useMemo(
    () =>
      all
        ? filterAndSortProjects(all, {
            query,
            sort,
            // Seluruh folder proyek; sebelum termuat, ukuran video sumber.
            sizeOf: (p) =>
              storageByProject?.[p.id]?.total ?? p.source?.sizeBytes ?? 0,
          })
        : [],
    [all, query, sort, storageByProject],
  );
  const footer = all ? footerText(visible, all.length, storageByProject) : "";

  return (
    <main className="max-w-page mx-auto space-y-12 px-4 py-8 lg:px-10 lg:py-12">
      <section aria-labelledby="start-heading" className="space-y-6">
        <div className="space-y-2">
          <h1 id="start-heading" className="text-3xl font-medium text-balance">
            Mau bikin klip apa hari ini?
          </h1>
          <p className="text-muted-foreground max-w-2xl text-base">
            Upload video atau tempel link. Momence mentranskrip, mencari momen
            terbaik, dan memberi skor, semuanya di Mac ini.
          </p>
        </div>
        <QuickActions />
      </section>

      <section aria-labelledby="projects-heading" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <h2 id="projects-heading" className="text-xl font-medium">
              Proyek
            </h2>
            {all && all.length > 0 && (
              <Badge variant="secondary" aria-label={`${all.length} proyek`}>
                {all.length}
              </Badge>
            )}
          </div>
          {all && all.length > 0 && (
            <ProjectToolbar
              query={query}
              onQueryChange={setQuery}
              sort={sort}
              onSortChange={setSort}
              view={view}
              onViewChange={setView}
            />
          )}
        </div>
        <WorkerBanner jobs={(all ?? []).flatMap((p) => p.jobs)} />
        {projects.isPending ? (
          <p className="text-muted-foreground text-sm">Memuat…</p>
        ) : projects.isError ? (
          <p role="alert" className="text-destructive text-sm">
            Gagal memuat proyek: {projects.error.message}
          </p>
        ) : projects.data.length === 0 ? (
          <div className="border-border flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center">
            <FolderOpen className="text-muted-foreground size-6" aria-hidden />
            <p className="text-base font-medium">Belum ada proyek</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Mulai dari kartu Upload video atau Impor dari link di atas. Proyek
              baru muncul di sini beserta progresnya.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="border-border space-y-3 rounded-xl border px-4 py-10 text-center">
            <p className="text-base font-medium">Tidak ada proyek yang cocok</p>
            <p className="text-muted-foreground text-sm">
              Tidak ada judul yang memuat “{query.trim()}”.
            </p>
            <Button variant="outline" size="sm" onClick={() => setQuery("")}>
              Hapus pencarian
            </Button>
          </div>
        ) : view === "table" ? (
          <ProjectTable
            projects={visible}
            storage={storageByProject}
            footer={footer}
          />
        ) : (
          <>
            <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  storage={storageByProject?.[project.id]}
                />
              ))}
            </div>
            <p className="label-mono text-muted-foreground">{footer}</p>
          </>
        )}
      </section>
    </main>
  );
}
