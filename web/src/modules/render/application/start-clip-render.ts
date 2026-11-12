import type { ClipEditorData } from "@/modules/editor/application";
import type { Job, NewJob } from "@/modules/jobs/application";
import type { ProjectWithSource } from "@/modules/projects/application";
import type { ReframeStatus } from "@/modules/reframe/application";
import { defaultReframe, type RenderPayload } from "@/shared/schemas";
import { composeClip, usesFaceCrop } from "./compose-clip";

export interface ClipEditorSource {
  execute(clipId: string): Promise<ClipEditorData | null>;
}

export interface ProjectSource {
  get(projectId: string): Promise<ProjectWithSource | null>;
}

export interface JobQueue {
  execute(job: NewJob): Promise<Job>;
}

export interface ReframeStatusSource {
  execute(clipId: string): Promise<{ status: ReframeStatus } | null>;
}

export type StartRenderResult =
  | { status: "started"; job: Job }
  | { status: "not_found" }
  /** Klip tidak bisa dirender; `message` untuk pengguna. */
  | { status: "invalid"; message: string };

const invalid = (message: string): StartRenderResult => ({
  status: "invalid",
  message,
});

/**
 * Antre render MP4 klip dari EditingScript yang TERSIMPAN (editan yang belum disimpan tidak ikut):
 * potongan, koreksi, gaya caption, reframe (rasio, layout, crop yang mengikuti wajah), B-roll, dan
 * teks custom. Tanpa EditingScript → klip utuh 9:16 dengan caption bawaan.
 */
export class StartClipRender {
  constructor(
    private readonly editor: ClipEditorSource,
    private readonly projects: ProjectSource,
    private readonly jobs: JobQueue,
    private readonly reframes: ReframeStatusSource,
  ) {}

  async execute(clipId: string): Promise<StartRenderResult> {
    const data = await this.editor.execute(clipId);
    if (!data) return { status: "not_found" };
    if (data.stale)
      return invalid(
        "Transkrip video berubah sejak klip ini diedit. Buka editor, periksa, lalu simpan ulang sebelum export.",
      );
    const source = (await this.projects.get(data.clip.projectId))?.source;
    if (!source) return invalid("Video sumber klip ini tidak ditemukan.");
    // Impor dari link: klip sudah muncul selagi video penuh masih diunduh/disiapkan.
    if (!source.proxyPath)
      return invalid(
        "Video sumber masih diunduh/disiapkan. Export bisa dilakukan setelah selesai.",
      );

    const script = data.editingScript?.script;
    const reframe = script?.reframe ?? defaultReframe();
    // Props dibuat sekarang; render sebelum analisis wajah selesai akan memakai crop tengah.
    if (usesFaceCrop(reframe) && !data.cropTracks) {
      const state = await this.reframes.execute(clipId);
      if (state?.status === "pending")
        return invalid(
          "Analisis wajah klip ini masih berjalan. Tunggu sampai selesai, lalu export lagi.",
        );
    }
    const { props } = composeClip({
      range: data.clip,
      tokens: data.tokens,
      removed: script?.removed ?? [],
      corrections: script?.corrections ?? {},
      caption: script?.caption ?? null,
      reframe,
      cropTracks: data.cropTracks,
      keywords: data.clip.details.keywords,
      broll: script?.broll ?? [],
      textOverlays: script?.textOverlays ?? [],
    });
    if (props.plan.durationInFrames === 0)
      return invalid(
        "Semua bagian klip terhapus; tidak ada yang bisa dirender.",
      );

    const payload: RenderPayload = {
      clipId,
      sourcePath: source.path,
      props,
    };
    const job = await this.jobs.execute({
      projectId: data.clip.projectId,
      type: "render",
      payload,
    });
    return { status: "started", job };
  }
}
