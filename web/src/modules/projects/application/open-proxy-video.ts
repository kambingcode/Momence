import { type ByteRange, parseByteRange } from "../domain/byte-range";
import type { MediaStorage, ProjectRepository } from "./ports";

export type ProxyVideo =
  | { status: "not_found" }
  /** Proyek ada, tetapi proxy belum dibuat (ingest belum selesai). */
  | { status: "not_ready" }
  | { status: "unsatisfiable"; size: number }
  | {
      status: "ok";
      size: number;
      /** `null` = seluruh file (200); selain itu sebagian (206). */
      range: ByteRange | null;
      stream: ReadableStream<Uint8Array>;
    };

/** Video proxy (MP4) untuk pratinjau, dengan dukungan header Range agar bisa di-seek. */
export class OpenProxyVideo {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly storage: MediaStorage,
  ) {}

  async execute(
    projectId: string,
    rangeHeader: string | null,
  ): Promise<ProxyVideo> {
    const project = await this.projects.get(projectId);
    if (!project) return { status: "not_found" };
    const proxyPath = project.source?.proxyPath;
    if (!proxyPath) return { status: "not_ready" };
    const size = await this.storage.fileSize(proxyPath);
    if (size === null) return { status: "not_ready" };

    const range = parseByteRange(rangeHeader, size);
    if (range === "unsatisfiable") return { status: "unsatisfiable", size };
    const bytes = range ?? { start: 0, end: size - 1 };
    return {
      status: "ok",
      size,
      range,
      stream: this.storage.readFile(proxyPath, bytes),
    };
  }
}
