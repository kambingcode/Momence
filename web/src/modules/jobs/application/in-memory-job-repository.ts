import type { Job } from "../domain/job";
import type { JobRepository, NewJob } from "./ports";

/** Fake adapter untuk unit test use case (tanpa DB). */
export class InMemoryJobRepository implements JobRepository {
  readonly jobs: Job[] = [];
  private seq = 0;

  async enqueue(input: NewJob): Promise<Job> {
    const now = ++this.seq;
    const job: Job = {
      id: `job-${now}`,
      projectId: input.projectId,
      type: input.type,
      status: "queued",
      progress: 0,
      payload: input.payload,
      result: null,
      error: null,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    };
    this.jobs.push(job);
    return job;
  }

  async findById(id: string): Promise<Job | null> {
    return this.jobs.find((j) => j.id === id) ?? null;
  }

  async listForProjects(projectIds: readonly string[]): Promise<Job[]> {
    return this.jobs.filter(
      (j) => j.projectId && projectIds.includes(j.projectId),
    );
  }

  async requeueFailed(id: string): Promise<Job | null> {
    const index = this.jobs.findIndex((j) => j.id === id);
    const job = this.jobs[index];
    if (!job || job.status !== "failed") return null;
    const requeued: Job = {
      ...job,
      status: "queued",
      progress: 0,
      result: null,
      error: null,
      attempts: 0,
      updatedAt: ++this.seq,
      startedAt: null,
      finishedAt: null,
    };
    this.jobs[index] = requeued;
    return requeued;
  }

  async list(filter: { projectId?: string; limit: number }): Promise<Job[]> {
    return this.jobs
      .filter((j) => !filter.projectId || j.projectId === filter.projectId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, filter.limit);
  }
}
