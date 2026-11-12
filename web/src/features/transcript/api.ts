import { errorMessage } from "@/features/projects/api";
import type { ProjectWithJobs } from "@/modules/projects/application";
import type { Transcript } from "@/modules/transcript/application";

export const projectQueryKey = (projectId: string) =>
  ["projects", projectId] as const;

/** `version` = waktu job transcribe selesai, agar transkripsi ulang ikut dimuat ulang. */
export const transcriptQueryKey = (projectId: string, version: number | null) =>
  ["projects", projectId, "transcript", version] as const;

export const proxyUrl = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/proxy`;

export class ProjectNotFoundError extends Error {
  constructor() {
    super("Proyek tidak ditemukan.");
    this.name = "ProjectNotFoundError";
  }
}

export async function fetchProject(
  projectId: string,
): Promise<ProjectWithJobs> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) throw new ProjectNotFoundError();
  if (!response.ok) throw new Error(await errorMessage(response));
  const body = (await response.json()) as { project: ProjectWithJobs };
  return body.project;
}

export async function fetchTranscript(
  projectId: string,
): Promise<Transcript | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/transcript`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  const body = (await response.json()) as { transcript: Transcript | null };
  return body.transcript;
}
