import { errorMessage } from "@/features/projects/api";
import type { Job } from "@/modules/jobs/application";
import type { ClipReframeState } from "@/modules/reframe/application";

export const reframeQueryKey = (clipId: string) =>
  ["clips", clipId, "reframe"] as const;

const reframeUrl = (clipId: string) =>
  `/api/clips/${encodeURIComponent(clipId)}/reframe`;

export async function fetchClipReframe(
  clipId: string,
): Promise<ClipReframeState> {
  const response = await fetch(reframeUrl(clipId), { cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as ClipReframeState;
}

/** Antre analisis wajah klip; gagal → Error berpesan untuk pengguna. */
export async function startClipReframe(clipId: string): Promise<Job> {
  const response = await fetch(reframeUrl(clipId), { method: "POST" });
  if (!response.ok) throw new Error(await errorMessage(response));
  return ((await response.json()) as { job: Job }).job;
}
