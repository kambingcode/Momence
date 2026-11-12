import { errorMessage } from "@/features/projects/api";
import type { Job } from "@/modules/jobs/application";

export const jobQueryKey = (jobId: string) => ["jobs", jobId] as const;

/** URL unduhan MP4 hasil job render yang sudah selesai. */
export const renderOutputUrl = (jobId: string) =>
  `/api/jobs/${encodeURIComponent(jobId)}/output`;

/** Antre render klip (dari EditingScript tersimpan); gagal → Error berpesan untuk pengguna. */
export async function startRender(clipId: string): Promise<Job> {
  const response = await fetch(
    `/api/clips/${encodeURIComponent(clipId)}/render`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  return ((await response.json()) as { job: Job }).job;
}

export async function fetchJob(jobId: string): Promise<Job> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return ((await response.json()) as { job: Job }).job;
}
