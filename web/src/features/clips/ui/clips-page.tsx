"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import { jobsPollInterval } from "@/features/jobs/poll";
import { JobStatus } from "@/features/jobs/ui/job-status";
import { PipelineSteps } from "@/features/jobs/ui/pipeline-steps";
import type { Job } from "@/modules/jobs/application";
import {
  fetchProject,
  ProjectNotFoundError,
  projectQueryKey,
  proxyUrl,
} from "@/features/transcript/api";
import { type ClipOrder, sortClips } from "@/modules/clips/application";
import { clipsQueryKey, fetchClips } from "../api";
import { ClipCard } from "./clip-card";

/** Job video penuh (impor link) menurut urutannya. */
const VIDEO_JOBS = ["download", "ingest"];

const ORDERS: { value: ClipOrder; label: string }[] = [
  { value: "score", label: "Skor tertinggi" },
  { value: "chronological", label: "Kronologis" },
];

/**
 * Impor dari link: klip sudah ditemukan dari audio selagi video penuh masih diunduh/disiapkan.
 * Pratinjau & Export aktif otomatis setelah proxy siap (halaman terus memuat ulang job).
 */
function VideoPreparing({ jobs }: { jobs: Job[] }) {
  const video = VIDEO_JOBS.map((type) =>
    jobs.find((job) => job.type === type),
  ).filter((job): job is Job => job !== undefined && job.status !== "done");
  const failed = video.find((job) => job.status === "failed");
  return (
    <div className="bg-secondary max-w-xl space-y-3 rounded-xl p-4">
      <p className="text-sm">
        {failed
          ? "Video gagal diproses, jadi pratinjau & Export belum tersedia. Klip di bawah tetap bisa dilihat dan diedit."
          : "Klip ditemukan dari audio. Pratinjau & Export aktif setelah video selesai diunduh dan disiapkan."}
      </p>
      {(failed ? [failed] : video.slice(0, 1)).map((job) => (
        <JobStatus key={job.id} job={job} />
      ))}
    </div>
  );
}

/** Tab "Klip" halaman proyek; kepala proyek & tab ada di `ProjectFrame` (layout). */
export function ClipsPage({ projectId }: { projectId: string }) {
  const project = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
    // Polling selama ingest/transcribe/discover belum selesai.
    refetchInterval: (query) => jobsPollInterval(query.state.data?.jobs),
    retry: (count, error) =>
      !(error instanceof ProjectNotFoundError) && count < 1,
  });
  const discover = project.data?.jobs.find((j) => j.type === "discover");
  const discovered = discover?.status === "done";
  const clips = useQuery({
    queryKey: clipsQueryKey(projectId, discover?.finishedAt ?? null),
    queryFn: () => fetchClips(projectId),
    enabled: discovered,
  });

  const [order, setOrder] = useState<ClipOrder>("score");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const sorted = useMemo(
    () => sortClips(clips.data ?? [], order),
    [clips.data, order],
  );

  // Proyek belum termuat / tidak ada: pesan ditampilkan kepala proyek (layout).
  if (!project.data) return null;

  const { source, jobs } = project.data;
  const aspectRatio =
    source?.width && source.height
      ? `${source.width} / ${source.height}`
      : "16 / 9";
  const portrait =
    source?.width && source.height && source.height > source.width;

  if (!discovered)
    return (
      <PipelineSteps
        jobs={jobs}
        waitingFor="Klip muncul di sini setelah pencarian klip selesai. Halaman ini diperbarui otomatis."
      />
    );
  if (clips.isPending)
    return <p className="text-muted-foreground text-sm">Memuat klip…</p>;
  if (clips.isError)
    return (
      <p role="alert" className="text-destructive text-sm">
        Gagal memuat klip: {clips.error.message}
      </p>
    );
  if (sorted.length === 0)
    return (
      <div className="border-border max-w-xl space-y-1 rounded-xl border border-dashed p-6">
        <p className="text-base font-medium">Belum ada klip</p>
        <p className="text-muted-foreground text-sm">
          Tidak ada bagian video yang layak dijadikan klip. Coba &ldquo;Cari
          ulang klip&rdquo; dengan fokus yang lebih spesifik.
        </p>
      </div>
    );

  return (
    <section aria-labelledby="clips-heading" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 id="clips-heading" className="text-base font-medium">
          {sorted.length} klip
        </h2>
        {sorted.length > 1 && (
          <SegmentedControl
            aria-label="Urutan klip"
            value={order}
            onValueChange={(value) => setOrder(value as ClipOrder)}
          >
            {ORDERS.map(({ value, label }) => (
              <SegmentedControlItem key={value} value={value}>
                {label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        )}
      </div>
      {!source?.proxyPath && <VideoPreparing jobs={jobs} />}
      <div
        className={
          portrait
            ? "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
            : "grid gap-5 md:grid-cols-2 xl:grid-cols-3"
        }
      >
        {sorted.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            videoSrc={source?.proxyPath ? proxyUrl(projectId) : null}
            aspectRatio={aspectRatio}
            active={playingId === clip.id}
            onPlay={() => setPlayingId(clip.id)}
          />
        ))}
      </div>
    </section>
  );
}
