import type { Clip } from "@/modules/clips/application";
import type { ClipEditorData } from "@/modules/editor/application";
import type { Job, NewJob } from "@/modules/jobs/application";
import {
  type BrollPlanBody,
  type BrollPlanPayload,
  brollPlanPayloadSchema,
  brollPlanResultSchema,
  type BrollSlot,
} from "@/shared/schemas";
import { brollPlanTokens, hasSpeech } from "../domain/plan-tokens";

export interface ClipLookup {
  get(clipId: string): Promise<Clip | null>;
}

export interface ProjectJobs {
  /** Job proyek, terbaru dulu. */
  execute(filter: { projectId: string; limit: number }): Promise<Job[]>;
}

export interface ClipEditorSource {
  execute(clipId: string): Promise<ClipEditorData | null>;
}

export interface JobQueue {
  execute(job: NewJob): Promise<Job>;
}

/**
 * `ready` = rencana terakhir selesai (slot boleh kosong bila klip tidak punya tempat yang cocok);
 * `pending` = job `broll-plan` klip ini sedang antre/berjalan; `failed` = job terakhirnya gagal;
 * `missing` = belum pernah direncanakan.
 */
export type BrollPlanStatus = "ready" | "pending" | "failed" | "missing";

export interface ClipBrollPlan {
  status: BrollPlanStatus;
  /** Job broll-plan terbaru untuk klip ini (progres / pesan gagal). */
  job: Job | null;
  slots: BrollSlot[];
}

/** Cukup untuk menemukan rencana terbaru klip di antara job proyek lain. */
const RECENT_JOBS = 200;

const forClip = (job: Job, clipId: string) =>
  job.type === "broll-plan" &&
  brollPlanPayloadSchema.safeParse(job.payload).data?.clipId === clipId;

/** Rencana B-roll terbaru klip; `null` bila klip tidak ada. */
export class GetBrollPlan {
  constructor(
    private readonly clips: ClipLookup,
    private readonly jobs: ProjectJobs,
  ) {}

  async execute(clipId: string): Promise<ClipBrollPlan | null> {
    const clip = await this.clips.get(clipId);
    return clip ? this.forClip(clip) : null;
  }

  async forClip(clip: Clip): Promise<ClipBrollPlan> {
    const jobs = await this.jobs.execute({
      projectId: clip.projectId,
      limit: RECENT_JOBS,
    });
    const job = jobs.find((j) => forClip(j, clip.id)) ?? null;
    switch (job?.status) {
      case undefined:
        return { status: "missing", job: null, slots: [] };
      case "queued":
      case "running":
        return { status: "pending", job, slots: [] };
      case "failed":
        return { status: "failed", job, slots: [] };
      case "done": {
        const result = brollPlanResultSchema.safeParse(job.result);
        return result.success
          ? { status: "ready", job, slots: result.data.slots }
          : { status: "failed", job, slots: [] };
      }
    }
  }
}

export type StartBrollPlanResult =
  | { status: "started"; job: Job }
  | { status: "not_found" }
  | { status: "invalid"; message: string };

/**
 * Antre rencana B-roll untuk klip dengan editan yang sedang dibuka (boleh belum disimpan). Job
 * yang masih antre/berjalan untuk klip ini dikembalikan, tidak mengantre ganda.
 */
export class StartBrollPlan {
  constructor(
    private readonly editor: ClipEditorSource,
    private readonly plans: Pick<GetBrollPlan, "forClip">,
    private readonly jobs: JobQueue,
  ) {}

  async execute(
    clipId: string,
    body: BrollPlanBody,
  ): Promise<StartBrollPlanResult> {
    const data = await this.editor.execute(clipId);
    if (!data) return { status: "not_found" };
    const current = await this.plans.forClip(data.clip);
    if (current.status === "pending" && current.job)
      return { status: "started", job: current.job };

    const tokens = brollPlanTokens(
      data.tokens,
      new Set(body.removedTokenIds),
      body.corrections,
    );
    if (!hasSpeech(tokens))
      return {
        status: "invalid",
        message:
          "Semua ucapan klip ini terhapus; tidak ada tempat untuk B-roll.",
      };
    const payload: BrollPlanPayload = {
      clipId,
      title: data.clip.title,
      tokens,
    };
    const job = await this.jobs.execute({
      projectId: data.clip.projectId,
      type: "broll-plan",
      payload,
    });
    return { status: "started", job };
  }
}
