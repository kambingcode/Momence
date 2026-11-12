import type { Clip } from "@/modules/clips/application";
import type { Job } from "@/modules/jobs/application";
import type { MediaStorage } from "@/modules/projects/application";
import { renderResultSchema } from "@/shared/schemas";

export interface JobSource {
  execute(jobId: string): Promise<Job | null>;
}

export interface ClipLookup {
  get(clipId: string): Promise<Clip | null>;
}

export type RenderOutput =
  | { status: "not_found" }
  /** Job render ada tetapi belum selesai (atau gagal). */
  | { status: "not_ready" }
  | {
      status: "ok";
      size: number;
      /** Judul klip, untuk nama file unduhan. */
      title: string;
      stream: ReadableStream<Uint8Array>;
    };

/** File MP4 hasil job render yang sudah selesai, di-stream dari disk. */
export class OpenRenderOutput {
  constructor(
    private readonly jobs: JobSource,
    private readonly clips: ClipLookup,
    private readonly storage: Pick<MediaStorage, "fileSize" | "readFile">,
  ) {}

  async execute(jobId: string): Promise<RenderOutput> {
    const job = await this.jobs.execute(jobId);
    if (!job || job.type !== "render") return { status: "not_found" };
    if (job.status !== "done") return { status: "not_ready" };
    const result = renderResultSchema.safeParse(job.result);
    if (!result.success) return { status: "not_found" };
    const { outputPath, clipId } = result.data;

    // File bisa sudah dihapus (pembersihan T9.3); MP4 kosong tidak pernah valid.
    const size = await this.storage.fileSize(outputPath);
    if (!size) return { status: "not_found" };
    const clip = await this.clips.get(clipId);
    return {
      status: "ok",
      size,
      title: clip?.title ?? "klip",
      stream: this.storage.readFile(outputPath, { start: 0, end: size - 1 }),
    };
  }
}
