import {
  type EnqueueJob,
  type GetProjectJobs,
  type Job,
  isFinished,
} from "@/modules/jobs/application";
import type { DiscoverPayload } from "@/shared/schemas";
import type { ClipFocusStore, ProjectRepository } from "./ports";

export type RequestClipDiscoveryResult =
  | { status: "queued"; job: Job }
  | { status: "not_found" }
  /** Transkrip belum selesai: belum ada yang bisa dicari klipnya. */
  | { status: "not_ready"; message: string }
  /** Proyek masih diproses worker (transkripsi, pencarian klip, atau reframe). */
  | { status: "busy"; jobType: string };

/**
 * Job yang tidak boleh berjalan bersamaan dengan pencarian klip ulang. Unduhan video & ingest
 * sengaja tidak termasuk: pencarian klip hanya butuh transkrip, dan `reframe` baru diantre begitu
 * proxy siap (oleh ingest atau discover, mana yang selesai belakangan).
 */
const EXCLUSIVE_JOB_TYPES = ["transcribe", "discover", "reframe"] as const;

/**
 * "Cari ulang klip": simpan fokus klip baru lalu antre job `discover` untuk transkrip yang sudah
 * ada. Worker bersifat idempoten: klip yang sudah diedit pengguna dipertahankan, selebihnya
 * diganti hasil pencarian baru.
 */
export class RequestClipDiscovery {
  constructor(
    private readonly projects: Pick<ProjectRepository, "get"> & ClipFocusStore,
    private readonly projectJobs: Pick<GetProjectJobs, "execute">,
    private readonly enqueueJob: Pick<EnqueueJob, "execute">,
  ) {}

  async execute(input: {
    projectId: string;
    clipFocus: string | null;
  }): Promise<RequestClipDiscoveryResult> {
    const project = await this.projects.get(input.projectId);
    if (!project) return { status: "not_found" };

    const jobs =
      (await this.projectJobs.execute([project.id])).get(project.id) ?? [];
    const active = jobs.find(
      (job) =>
        !isFinished(job.status) &&
        (EXCLUSIVE_JOB_TYPES as readonly string[]).includes(job.type),
    );
    if (active) return { status: "busy", jobType: active.type };

    const transcribed = jobs.find((job) => job.type === "transcribe");
    if (!project.source || transcribed?.status !== "done") {
      return {
        status: "not_ready",
        message: "Transkrip belum selesai; klip baru bisa dicari setelahnya.",
      };
    }

    const previous = project.clipFocus ?? null;
    await this.projects.setClipFocus(project.id, input.clipFocus);
    try {
      const payload: DiscoverPayload = { sourceId: project.source.id };
      const job = await this.enqueueJob.execute({
        projectId: project.id,
        type: "discover",
        payload,
      });
      return { status: "queued", job };
    } catch (error) {
      // Jangan biarkan fokus berubah tanpa pencarian yang mengikutinya.
      await this.projects.setClipFocus(project.id, previous);
      throw error;
    }
  }
}
