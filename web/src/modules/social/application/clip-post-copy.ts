import type { Clip } from "@/modules/clips/application";
import type { Job, NewJob } from "@/modules/jobs/application";
import {
  type PostCopyBody,
  type PostCopyPayload,
  type PostCopyResult,
  postCopyPayloadSchema,
  postCopyResultSchema,
} from "@/shared/schemas";
import { type SpokenToken, spokenText } from "../domain/spoken-text";

export interface ClipLookup {
  get(clipId: string): Promise<Clip | null>;
}

export interface ProjectJobs {
  /** Job proyek, terbaru dulu. */
  execute(filter: { projectId: string; limit: number }): Promise<Job[]>;
}

/** Klip + token transkripnya yang tersimpan (mis. `GetClipEditor`); `null` bila klip tidak ada. */
export interface ClipSpeechSource {
  execute(
    clipId: string,
  ): Promise<{ clip: Clip; tokens: readonly SpokenToken[] } | null>;
}

export interface JobQueue {
  execute(job: NewJob): Promise<Job>;
}

/**
 * `ready` = caption terakhir selesai; `pending` = job `post-copy` klip ini sedang antre/berjalan;
 * `failed` = job terakhirnya gagal; `missing` = belum pernah dibuat.
 */
export type PostCopyStatus = "ready" | "pending" | "failed" | "missing";

export interface ClipPostCopy {
  status: PostCopyStatus;
  /** Job post-copy terbaru untuk klip ini (progres / pesan gagal). */
  job: Job | null;
  /** Hasil terbaru; `null` kecuali `ready`. */
  copy: PostCopyResult | null;
}

/** Cukup untuk menemukan job terbaru klip di antara job proyek lain. */
const RECENT_JOBS = 200;

const forClip = (job: Job, clipId: string) =>
  job.type === "post-copy" &&
  postCopyPayloadSchema.safeParse(job.payload).data?.clipId === clipId;

/** Caption & hashtag terbaru klip; `null` bila klip tidak ada. */
export class GetPostCopy {
  constructor(
    private readonly clips: ClipLookup,
    private readonly jobs: ProjectJobs,
  ) {}

  async execute(clipId: string): Promise<ClipPostCopy | null> {
    const clip = await this.clips.get(clipId);
    return clip ? this.forClip(clip) : null;
  }

  async forClip(clip: Clip): Promise<ClipPostCopy> {
    const jobs = await this.jobs.execute({
      projectId: clip.projectId,
      limit: RECENT_JOBS,
    });
    const job = jobs.find((j) => forClip(j, clip.id)) ?? null;
    switch (job?.status) {
      case undefined:
        return { status: "missing", job: null, copy: null };
      case "queued":
      case "running":
        return { status: "pending", job, copy: null };
      case "failed":
        return { status: "failed", job, copy: null };
      case "done": {
        const result = postCopyResultSchema.safeParse(job.result);
        return result.success
          ? { status: "ready", job, copy: result.data }
          : { status: "failed", job, copy: null };
      }
    }
  }
}

export type StartPostCopyResult =
  | { status: "started"; job: Job }
  | { status: "not_found" }
  | { status: "invalid"; message: string };

/**
 * Antre penulisan caption & hashtag untuk klip dari transkrip tersimpan (bukan draf editor).
 * Job yang masih antre/berjalan untuk klip ini dikembalikan, tidak mengantre ganda.
 */
export class StartPostCopy {
  constructor(
    private readonly speech: ClipSpeechSource,
    private readonly copies: Pick<GetPostCopy, "forClip">,
    private readonly jobs: JobQueue,
  ) {}

  async execute(
    clipId: string,
    body: PostCopyBody,
  ): Promise<StartPostCopyResult> {
    const data = await this.speech.execute(clipId);
    if (!data) return { status: "not_found" };
    const current = await this.copies.forClip(data.clip);
    if (current.status === "pending" && current.job)
      return { status: "started", job: current.job };

    const transcript = spokenText(data.tokens);
    if (transcript === "")
      return {
        status: "invalid",
        message: "Klip ini tidak berisi ucapan, jadi tidak ada bahan caption.",
      };
    const payload: PostCopyPayload = {
      clipId,
      title: data.clip.title,
      hook: data.clip.details.hook,
      platform: body.platform,
      language: body.language === "auto" ? null : body.language,
      transcript,
    };
    const job = await this.jobs.execute({
      projectId: data.clip.projectId,
      type: "post-copy",
      payload,
    });
    return { status: "started", job };
  }
}
