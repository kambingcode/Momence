import { errorMessage } from "@/features/projects/api";
import type { Job } from "@/modules/jobs/application";
import type { ClipPostCopy } from "@/modules/social/application";
import type { PostCopyBody } from "@/shared/schemas";

export const postCopyQueryKey = (clipId: string) =>
  ["clips", clipId, "post-copy"] as const;

const postCopyUrl = (clipId: string) =>
  `/api/clips/${encodeURIComponent(clipId)}/post-copy`;

export async function fetchPostCopy(clipId: string): Promise<ClipPostCopy> {
  const response = await fetch(postCopyUrl(clipId), { cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as ClipPostCopy;
}

/** Antre caption & hashtag; gagal → Error berpesan untuk pengguna. */
export async function startPostCopy(
  clipId: string,
  body: PostCopyBody,
): Promise<Job> {
  const response = await fetch(postCopyUrl(clipId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return ((await response.json()) as { job: Job }).job;
}
