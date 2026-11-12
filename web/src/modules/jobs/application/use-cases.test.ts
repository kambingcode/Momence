import { describe, expect, it } from "vitest";
import { InMemoryJobRepository } from "./in-memory-job-repository";
import {
  EnqueueJob,
  GetJob,
  GetProjectJobs,
  ListJobs,
  MAX_LIST_LIMIT,
  RetryJob,
} from "./use-cases";

describe("jobs use cases", () => {
  it("EnqueueJob membuat job queued dengan progres 0", async () => {
    const repo = new InMemoryJobRepository();
    const job = await new EnqueueJob(repo).execute({
      projectId: null,
      type: "noop",
      payload: { durationMs: 10 },
    });
    expect(job).toMatchObject({ status: "queued", progress: 0, attempts: 0 });
    expect(await new GetJob(repo).execute(job.id)).toEqual(job);
  });

  it("ListJobs memfilter per proyek, terbaru dulu, dan membatasi limit", async () => {
    const repo = new InMemoryJobRepository();
    const enqueue = new EnqueueJob(repo);
    await enqueue.execute({ projectId: "a", type: "noop", payload: {} });
    await enqueue.execute({ projectId: "b", type: "noop", payload: {} });
    const last = await enqueue.execute({
      projectId: "a",
      type: "ingest",
      payload: {},
    });

    const list = new ListJobs(repo);
    const forA = await list.execute({ projectId: "a" });
    expect(forA.map((j) => j.projectId)).toEqual(["a", "a"]);
    expect(forA[0]?.id).toBe(last.id);
    expect(await list.execute({ limit: 1 })).toHaveLength(1);

    class SpyRepository extends InMemoryJobRepository {
      lastLimit = 0;
      override list(filter: { projectId?: string; limit: number }) {
        this.lastLimit = filter.limit;
        return super.list(filter);
      }
    }
    const spy = new SpyRepository();
    await new ListJobs(spy).execute({ limit: 10_000 });
    expect(spy.lastLimit).toBe(MAX_LIST_LIMIT);
  });

  it("GetProjectJobs mengelompokkan job terbaru per tipe untuk tiap proyek", async () => {
    const repo = new InMemoryJobRepository();
    const enqueue = new EnqueueJob(repo);
    await enqueue.execute({ projectId: "a", type: "ingest", payload: {} });
    const retry = await enqueue.execute({
      projectId: "a",
      type: "ingest",
      payload: {},
    });
    await enqueue.execute({ projectId: "b", type: "ingest", payload: {} });

    const result = await new GetProjectJobs(repo).execute(["a", "c"]);
    expect(result.get("a")?.map((j) => j.id)).toEqual([retry.id]);
    expect(result.get("c")).toEqual([]);
    expect(result.has("b")).toBe(false);
  });

  it("RetryJob mengantre ulang job gagal & menolak status lain", async () => {
    const repo = new InMemoryJobRepository();
    const job = await new EnqueueJob(repo).execute({
      projectId: "a",
      type: "discover",
      payload: { sourceId: "s1" },
    });
    const retry = new RetryJob(repo);
    expect(await retry.execute(job.id)).toEqual({ status: "not_failed", job });
    expect(await retry.execute("tidak-ada")).toEqual({ status: "not_found" });

    repo.jobs[0] = { ...job, status: "failed", error: "boom", attempts: 2 };
    const result = await retry.execute(job.id);
    expect(result.status).toBe("queued");
    if (result.status !== "queued") return;
    expect(result.job).toMatchObject({
      id: job.id,
      status: "queued",
      error: null,
      attempts: 0,
      payload: { sourceId: "s1" },
      createdAt: job.createdAt,
    });
    expect((await retry.execute(job.id)).status).toBe("not_failed");
  });
});
