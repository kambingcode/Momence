"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsQueryKey } from "@/features/projects/api";
import { jobQueryKey } from "@/features/render/api";
import type { Job } from "@/modules/jobs/application";
import { retryJob } from "./api";

/** Antre ulang job yang gagal, lalu muat ulang daftar proyek & status job-nya. */
export function useRetryJob(job: Pick<Job, "id">) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => retryJob(job.id),
    // Dashboard & halaman proyek (prefix "projects") serta tombol Export (job per id) memuat
    // ulang job ini dan polling lagi.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: projectsQueryKey }),
        queryClient.invalidateQueries({ queryKey: jobQueryKey(job.id) }),
      ]),
  });
}
