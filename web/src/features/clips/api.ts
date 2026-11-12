import { errorMessage } from "@/features/projects/api";
import type { Clip } from "@/modules/clips/application";

export const clipsPath = (projectId: string) =>
  `/projects/${encodeURIComponent(projectId)}/clips`;

export const editorPath = (projectId: string, clipId: string) =>
  `${clipsPath(projectId)}/${encodeURIComponent(clipId)}/edit`;

/** `version` = waktu job discover selesai, agar discover ulang ikut dimuat ulang. */
export const clipsQueryKey = (projectId: string, version: number | null) =>
  ["projects", projectId, "clips", version] as const;

export async function fetchClips(projectId: string): Promise<Clip[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/clips`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  const body = (await response.json()) as { clips: Clip[] };
  return body.clips;
}

/** Simpan fokus klip baru lalu antre pencarian klip ulang (job `discover`). */
export async function rediscoverClips(
  projectId: string,
  clipFocus: string,
): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/discover`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipFocus }),
    },
  );
  if (!response.ok) throw new Error(await errorMessage(response));
}
