"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clipsPath } from "@/features/clips/api";
import { RediscoverDialog } from "@/features/clips/ui/rediscover-dialog";
import { jobsPollInterval } from "@/features/jobs/poll";
import {
  fetchProject,
  ProjectNotFoundError,
  projectQueryKey,
} from "@/features/transcript/api";
import { cn } from "@/lib/utils";
import { formatDuration } from "./format";

/** Job yang tidak boleh berjalan bersamaan dengan pencarian klip ulang (cermin use case web). */
const EXCLUSIVE_JOBS = ["transcribe", "discover", "reframe"];

/**
 * Kerangka halaman satu proyek (layout `/projects/[id]`): remah roti, judul, keterangan video &
 * fokus klip, aksi "Cari ulang klip", dan tab halaman Klip | Transkrip. Isi tab (`children`)
 * baru dirender setelah proyek termuat; proyek tidak ada / gagal dimuat → pesan di sini saja.
 */
export function ProjectFrame({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const project = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
    // Polling selama ingest/transcribe/discover belum selesai.
    refetchInterval: (query) => jobsPollInterval(query.state.data?.jobs),
    retry: (count, error) =>
      !(error instanceof ProjectNotFoundError) && count < 1,
  });
  const [rediscoverOpen, setRediscoverOpen] = useState(false);

  const data = project.data;
  const name = data?.name;
  const source = data?.source;
  const jobs = data?.jobs ?? [];
  const clipFocus = data?.clipFocus ?? null;
  const transcribed = jobs.some(
    (j) => j.type === "transcribe" && j.status === "done",
  );
  const pipelineBusy = jobs.some(
    (j) =>
      EXCLUSIVE_JOBS.includes(j.type) &&
      (j.status === "queued" || j.status === "running"),
  );
  const details = [
    source?.durationMs != null ? formatDuration(source.durationMs) : null,
    source?.width && source.height ? `${source.width}×${source.height}` : null,
  ].filter(Boolean);

  return (
    <main className="max-w-page mx-auto space-y-6 px-4 py-8 lg:px-10 lg:py-10">
      <header className="space-y-5">
        <nav aria-label="Remah roti">
          <ol className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm">
            <li className="shrink-0">
              <Link
                href="/"
                className="hover:text-foreground focus-visible:ring-ring/40 rounded-xs outline-none focus-visible:ring-3"
              >
                Proyek
              </Link>
            </li>
            <li aria-hidden className="shrink-0">
              <ChevronRight className="size-3.5" />
            </li>
            <li
              className="text-foreground min-w-0 truncate"
              aria-current="page"
            >
              {name ?? "…"}
            </li>
          </ol>
        </nav>

        {project.isPending ? (
          <p className="text-muted-foreground text-sm">Memuat…</p>
        ) : project.isError ? (
          <p role="alert" className="text-destructive">
            {project.error instanceof ProjectNotFoundError
              ? "Proyek tidak ditemukan."
              : `Gagal memuat proyek: ${project.error.message}`}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
              <div className="min-w-0 flex-1 basis-80 space-y-2">
                <h1
                  className="line-clamp-2 text-2xl font-medium tracking-tight"
                  title={name}
                >
                  {name}
                </h1>
                <p className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {details.length > 0 && (
                    <span className="label-mono text-sm tabular-nums">
                      {details.join(" · ")}
                    </span>
                  )}
                  {details.length > 0 && <span aria-hidden>·</span>}
                  <span
                    className="max-w-full min-w-0 truncate"
                    title={clipFocus ?? undefined}
                  >
                    {clipFocus ? `Fokus: ${clipFocus}` : "Tanpa fokus klip"}
                  </span>
                </p>
              </div>
              {transcribed && (
                <Button
                  variant="outline"
                  disabled={pipelineBusy}
                  title={
                    pipelineBusy
                      ? "Tunggu proses yang sedang berjalan selesai."
                      : "Minta Gemini mencari klip lagi, opsional dengan fokus baru."
                  }
                  onClick={() => setRediscoverOpen(true)}
                >
                  <RefreshCw aria-hidden />
                  Cari ulang klip
                </Button>
              )}
            </div>
            <ProjectTabs projectId={projectId} />
          </>
        )}
      </header>

      {data && children}

      {data && (
        <RediscoverDialog
          key={clipFocus ?? ""}
          projectId={projectId}
          initialFocus={clipFocus}
          open={rediscoverOpen}
          onOpenChange={setRediscoverOpen}
        />
      )}
    </main>
  );
}

/** Tab halaman (tautan): hairline bawah, tab aktif bergaris violet 2px & bobot 500. */
function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: clipsPath(projectId), label: "Klip" },
    { href: `/projects/${encodeURIComponent(projectId)}`, label: "Transkrip" },
  ];
  return (
    <nav aria-label="Bagian proyek" className="border-b">
      <ul className="flex gap-6">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/40 relative -mb-px inline-flex h-10 items-center rounded-xs text-sm transition-colors duration-150 outline-none focus-visible:ring-3",
                  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5",
                  active
                    ? "text-foreground after:bg-logo-violet font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
