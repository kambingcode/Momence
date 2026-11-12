import { canTransition, type Job, latestPerType } from "../domain/job";
import type { JobRepository, NewJob } from "./ports";

export class EnqueueJob {
  constructor(private readonly jobs: JobRepository) {}

  execute(input: NewJob): Promise<Job> {
    return this.jobs.enqueue(input);
  }
}

export class GetJob {
  constructor(private readonly jobs: JobRepository) {}

  execute(id: string): Promise<Job | null> {
    return this.jobs.findById(id);
  }
}

export const MAX_LIST_LIMIT = 200;

export class ListJobs {
  constructor(private readonly jobs: JobRepository) {}

  execute(filter: { projectId?: string; limit?: number }): Promise<Job[]> {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), MAX_LIST_LIMIT);
    return this.jobs.list({ projectId: filter.projectId, limit });
  }
}

/** Job terbaru per tipe untuk tiap proyek (untuk dashboard). */
export class GetProjectJobs {
  constructor(private readonly jobs: JobRepository) {}

  async execute(projectIds: readonly string[]): Promise<Map<string, Job[]>> {
    const byProject = new Map<string, Job[]>(projectIds.map((id) => [id, []]));
    if (projectIds.length === 0) return byProject;
    for (const job of await this.jobs.listForProjects(projectIds)) {
      if (job.projectId) byProject.get(job.projectId)?.push(job);
    }
    for (const [id, jobs] of byProject) byProject.set(id, latestPerType(jobs));
    return byProject;
  }
}

export type RetryJobResult =
  | { status: "queued"; job: Job }
  | { status: "not_found" }
  /** Hanya job yang gagal yang bisa diulang. */
  | { status: "not_failed"; job: Job };

/** Masukkan job gagal kembali ke antrean dengan payload yang sama. */
export class RetryJob {
  constructor(private readonly jobs: JobRepository) {}

  async execute(id: string): Promise<RetryJobResult> {
    const job = await this.jobs.findById(id);
    if (!job) return { status: "not_found" };
    if (!canTransition(job.status, "queued"))
      return { status: "not_failed", job };
    const requeued = await this.jobs.requeueFailed(id);
    if (requeued) return { status: "queued", job: requeued };
    // Status berubah di antara baca & tulis (mis. sudah diulang dari tab lain).
    const current = await this.jobs.findById(id);
    return current
      ? { status: "not_failed", job: current }
      : { status: "not_found" };
  }
}
