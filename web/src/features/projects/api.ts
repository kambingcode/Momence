import type {
  ImportVideoFromUrlResult,
  ProjectListItem,
  StorageOverview,
  UploadVideoResult,
} from "@/modules/projects/application";
import type { DownloadResolution } from "@/shared/schemas";

export const projectsQueryKey = ["projects"] as const;
// Di bawah "projects": ikut dimuat ulang setiap daftar proyek di-invalidate (unggah, hapus, retry).
export const storageQueryKey = [...projectsQueryKey, "storage"] as const;

/** Pesan galat dari balasan API (`{ error }`), atau penjelasan umum per status HTTP. */
export async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (body?.error) return body.error;
  if (response.status >= 500)
    return `Terjadi galat di server web (${response.status}); detailnya ada di terminal npm run dev. Muat ulang halaman setelah diperbaiki.`;
  return `Server membalas ${response.status}`;
}

export async function fetchProjects(): Promise<ProjectListItem[]> {
  const response = await fetch("/api/projects", { cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response));
  const body = (await response.json()) as { projects: ProjectListItem[] };
  return body.projects;
}

export async function fetchStorage(): Promise<StorageOverview> {
  const response = await fetch("/api/storage", { cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as StorageOverview;
}

/** Hapus proyek beserta file medianya. Proyek yang sudah tidak ada dianggap berhasil. */
export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404)
    throw new Error(await errorMessage(response));
}

/** Buat proyek dari link YouTube atau VOD Twitch; worker mengunduh videonya (job `download`). */
export async function importVideoFromUrl({
  url,
  clipFocus,
  maxResolution,
}: {
  url: string;
  clipFocus?: string;
  maxResolution?: DownloadResolution;
}): Promise<ImportVideoFromUrlResult> {
  const response = await fetch("/api/projects/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, clipFocus, maxResolution }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as ImportVideoFromUrlResult;
}

export class UploadAbortedError extends Error {
  constructor() {
    super("Upload dibatalkan.");
    this.name = "UploadAbortedError";
  }
}

/**
 * Kirim file sebagai body mentah (di-stream ke disk oleh server).
 * XMLHttpRequest dipakai karena fetch belum memberi progres upload.
 */
export function uploadVideo(
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
  clipFocus?: string,
): Promise<UploadVideoResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const focus = clipFocus?.trim();
    xhr.open(
      "POST",
      `/api/projects?filename=${encodeURIComponent(file.name)}` +
        (focus ? `&focus=${encodeURIComponent(focus)}` : ""),
    );
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      const body = xhr.response as
        (UploadVideoResult & { error?: string }) | null;
      if (xhr.status === 201 && body) resolve(body);
      else reject(new Error(body?.error ?? `Upload gagal (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Koneksi ke server terputus."));
    xhr.onabort = () => reject(new UploadAbortedError());
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
