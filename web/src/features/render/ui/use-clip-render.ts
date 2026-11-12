"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { jobsPollInterval } from "@/features/jobs/poll";
import type { Job } from "@/modules/jobs/application";
import { fetchJob, jobQueryKey, startRender } from "../api";

export type RenderPhase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "queued"; job: Job }
  | { kind: "running"; job: Job; progress: number }
  | { kind: "done"; job: Job }
  | { kind: "failed"; message: string };

/**
 * Render klip ke MP4 (EditingScript tersimpan): antre job, poll sampai selesai. Fase "failed"
 * mencakup gagal mengantre maupun job yang gagal; `start()` lagi = coba lagi / render ulang.
 */
export function useClipRender(clipId: string) {
  const start = useMutation({ mutationFn: () => startRender(clipId) });
  const { mutate } = start;
  const startRenderJob = useCallback(() => mutate(), [mutate]);
  const jobId = start.data?.id ?? null;
  const job = useQuery({
    queryKey: jobQueryKey(jobId ?? ""),
    queryFn: () => fetchJob(jobId!),
    enabled: jobId !== null,
    initialData: start.data,
    refetchInterval: (query) =>
      jobsPollInterval(query.state.data ? [query.state.data] : undefined),
  });
  const current = jobId ? job.data : undefined;

  let phase: RenderPhase = { kind: "idle" };
  if (start.isPending) phase = { kind: "starting" };
  else if (start.error)
    phase = { kind: "failed", message: start.error.message };
  else if (current?.status === "failed")
    phase = { kind: "failed", message: current.error ?? "Render gagal" };
  else if (current?.status === "queued")
    phase = { kind: "queued", job: current };
  else if (current?.status === "running")
    phase = { kind: "running", job: current, progress: current.progress };
  else if (current?.status === "done") phase = { kind: "done", job: current };
  return { phase, start: startRenderJob };
}
