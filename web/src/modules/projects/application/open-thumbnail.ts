import { thumbnailPath } from "../domain/thumbnail";
import type { MediaStorage, ProjectRepository } from "./ports";

export type Thumbnail =
  | { status: "not_found" }
  /** Proyek ada, tetapi thumbnail belum dibuat (ingest belum selesai atau gagal membuatnya). */
  | { status: "not_ready" }
  | { status: "ok"; size: number; stream: ReadableStream<Uint8Array> };

/** Gambar JPEG kecil (±320 px) untuk daftar proyek. */
export class OpenThumbnail {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly storage: MediaStorage,
  ) {}

  async execute(projectId: string): Promise<Thumbnail> {
    const project = await this.projects.get(projectId);
    if (!project) return { status: "not_found" };
    const proxyPath = project.source?.proxyPath;
    if (!proxyPath) return { status: "not_ready" };
    const path = thumbnailPath(proxyPath);
    const size = await this.storage.fileSize(path);
    // File kosong tidak mungkin dibaca sebagai gambar (rentang byte juga tidak valid).
    if (size === null || size === 0) return { status: "not_ready" };
    return {
      status: "ok",
      size,
      stream: this.storage.readFile(path, { start: 0, end: size - 1 }),
    };
  }
}
