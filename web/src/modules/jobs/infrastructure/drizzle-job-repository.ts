import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import type { Job, JobRepository, NewJob } from "../application";

type JobRow = typeof jobs.$inferSelect;

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    progress: row.progress,
    payload: row.payload,
    result: row.result ?? null,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

export class DrizzleJobRepository implements JobRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  async enqueue(input: NewJob): Promise<Job> {
    const now = this.now();
    const [row] = await this.db
      .insert(jobs)
      .values({
        id: randomUUID(),
        projectId: input.projectId,
        type: input.type,
        payload: input.payload ?? {},
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) throw new Error("Gagal menyimpan job");
    return toJob(row);
  }

  async findById(id: string): Promise<Job | null> {
    const row = await this.db.query.jobs.findFirst({ where: eq(jobs.id, id) });
    return row ? toJob(row) : null;
  }

  async listForProjects(projectIds: readonly string[]): Promise<Job[]> {
    if (projectIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(jobs)
      .where(inArray(jobs.projectId, [...projectIds]));
    return rows.map(toJob);
  }

  async requeueFailed(id: string): Promise<Job | null> {
    // Syarat status dicek saat menulis: dua permintaan Retry tidak mengantre dua kali.
    const [row] = await this.db
      .update(jobs)
      .set({
        status: "queued",
        progress: 0,
        result: null,
        error: null,
        attempts: 0,
        updatedAt: this.now(),
        startedAt: null,
        finishedAt: null,
      })
      .where(and(eq(jobs.id, id), eq(jobs.status, "failed")))
      .returning();
    return row ? toJob(row) : null;
  }

  async list(filter: { projectId?: string; limit: number }): Promise<Job[]> {
    const rows = await this.db
      .select()
      .from(jobs)
      .where(
        filter.projectId ? eq(jobs.projectId, filter.projectId) : undefined,
      )
      .orderBy(desc(jobs.createdAt))
      .limit(filter.limit);
    return rows.map(toJob);
  }
}
