import type { Clip } from "@/modules/clips/application";
import type { Job, NewJob } from "@/modules/jobs/application";
import {
  type CropTracks,
  type ReframePayload,
  reframePayloadSchema,
} from "@/shared/schemas";
import type { ClipRange } from "./get-clip-crop-tracks";

export interface ClipLookup {
  get(clipId: string): Promise<Clip | null>;
}

export interface CropTracksLookup {
  execute(clip: ClipRange): Promise<CropTracks | null>;
}

export interface ProjectJobs {
  /** Job proyek, terbaru dulu. */
  execute(filter: { projectId: string; limit: number }): Promise<Job[]>;
}

export interface JobQueue {
  execute(job: NewJob): Promise<Job>;
}

/**
 * `ready` = jalur crop tersedia; `pending` = job `reframe` untuk klip ini sedang antre/berjalan;
 * `failed` = job terakhirnya gagal; `missing` = belum pernah dianalisis (klip lama) atau rentang
 * klip berubah sejak dianalisis.
 */
export type ReframeStatus = "ready" | "pending" | "failed" | "missing";

export interface ClipReframeState {
  status: ReframeStatus;
  /** Job reframe terbaru untuk klip ini (progres / pesan gagal). */
  job: Job | null;
  cropTracks: CropTracks | null;
}

/** Cukup untuk job reframe hasil discover (satu per discover) & analisis manual per klip. */
const RECENT_JOBS = 200;

const coversClip = (job: Job, clipId: string) => {
  if (job.type !== "reframe") return false;
  const payload = reframePayloadSchema.safeParse(job.payload);
  return payload.success && payload.data.clipIds.includes(clipId);
};

/** Status auto-reframe klip + jalur crop-nya; `null` bila klip tidak ada. */
export class GetClipReframe {
  constructor(
    private readonly clips: ClipLookup,
    private readonly cropTracks: CropTracksLookup,
    private readonly jobs: ProjectJobs,
  ) {}

  async execute(clipId: string): Promise<ClipReframeState | null> {
    const clip = await this.clips.get(clipId);
    return clip ? this.forClip(clip) : null;
  }

  async forClip(clip: Clip): Promise<ClipReframeState> {
    const [cropTracks, jobs] = await Promise.all([
      this.cropTracks.execute(clip),
      this.jobs.execute({ projectId: clip.projectId, limit: RECENT_JOBS }),
    ]);
    const job = jobs.find((j) => coversClip(j, clip.id)) ?? null;
    if (cropTracks) return { status: "ready", job, cropTracks };
    const status: ReframeStatus =
      job?.status === "queued" || job?.status === "running"
        ? "pending"
        : job?.status === "failed"
          ? "failed"
          : "missing";
    return { status, job, cropTracks: null };
  }
}

export type StartReframeResult =
  { status: "started"; job: Job } | { status: "not_found" };

/**
 * Antre analisis wajah untuk satu klip (klip lama / analisis gagal). Sudah antre/berjalan →
 * kembalikan job itu, tidak mengantre ganda.
 */
export class StartClipReframe {
  constructor(
    private readonly clips: ClipLookup,
    private readonly reframes: Pick<GetClipReframe, "forClip">,
    private readonly jobs: JobQueue,
  ) {}

  async execute(clipId: string): Promise<StartReframeResult> {
    const clip = await this.clips.get(clipId);
    if (!clip) return { status: "not_found" };
    const state = await this.reframes.forClip(clip);
    if (state.status === "pending" && state.job)
      return { status: "started", job: state.job };
    const payload: ReframePayload = { clipIds: [clipId] };
    const job = await this.jobs.execute({
      projectId: clip.projectId,
      type: "reframe",
      payload,
    });
    return { status: "started", job };
  }
}
