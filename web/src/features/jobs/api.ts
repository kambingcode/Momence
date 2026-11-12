import { errorMessage } from "@/features/projects/api";
import type { Job } from "@/modules/jobs/application";

/** Antre ulang job yang gagal (payload sama). */
export async function retryJob(jobId: string): Promise<Job> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return ((await response.json()) as { job: Job }).job;
}
