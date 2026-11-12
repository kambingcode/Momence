import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "@/server/db/client";
import { jobs, projects } from "@/server/db/schema";
import { DrizzleJobRepository } from "./drizzle-job-repository";

// Tes integrasi: DB SQLite sungguhan di folder sementara, dengan migrasi drizzle.
describe("DrizzleJobRepository", () => {
  let dir: string;
  let db: Database;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "clipstudio-test-"));
    db = await openDatabase(`file:${path.join(dir, "test.db")}`, dir);
  });

  afterEach(async () => {
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("menyimpan job baru sebagai queued dan membacanya kembali", async () => {
    const repo = new DrizzleJobRepository(db, () => 1_000);
    const job = await repo.enqueue({
      projectId: null,
      type: "noop",
      payload: { durationMs: 5 },
    });
    expect(job).toMatchObject({
      status: "queued",
      progress: 0,
      payload: { durationMs: 5 },
      createdAt: 1_000,
      result: null,
    });
    expect(await repo.findById(job.id)).toEqual(job);
    expect(await repo.findById("tidak-ada")).toBeNull();
  });

  it("list memfilter proyek dan mengurutkan terbaru dulu", async () => {
    await db.insert(projects).values({ id: "p1", name: "Proyek 1" });
    let t = 0;
    const repo = new DrizzleJobRepository(db, () => ++t);
    await repo.enqueue({ projectId: "p1", type: "ingest", payload: {} });
    await repo.enqueue({ projectId: null, type: "noop", payload: {} });
    const latest = await repo.enqueue({
      projectId: "p1",
      type: "transcribe",
      payload: {},
    });

    const forP1 = await repo.list({ projectId: "p1", limit: 10 });
    expect(forP1.map((j) => j.type)).toEqual(["transcribe", "ingest"]);
    expect(forP1[0]?.id).toBe(latest.id);
    expect(await repo.list({ limit: 2 })).toHaveLength(2);
  });

  it("menolak project_id yang tidak ada (foreign key aktif)", async () => {
    const repo = new DrizzleJobRepository(db);
    await expect(
      repo.enqueue({ projectId: "hilang", type: "noop", payload: {} }),
    ).rejects.toThrow();
  });

  it("requeueFailed hanya mengantre ulang job yang gagal, sekali", async () => {
    let now = 1_000;
    const repo = new DrizzleJobRepository(db, () => now);
    const job = await repo.enqueue({
      projectId: null,
      type: "noop",
      payload: { durationMs: 5 },
    });
    expect(await repo.requeueFailed(job.id)).toBeNull(); // masih queued

    // Bentuk yang ditulis worker setelah gagal.
    await db
      .update(jobs)
      .set({
        status: "failed",
        progress: 40,
        error: "boom",
        result: { partial: true },
        attempts: 3,
        startedAt: 1_100,
        finishedAt: 1_200,
      })
      .where(eq(jobs.id, job.id));
    now = 2_000;
    const requeued = await repo.requeueFailed(job.id);
    expect(requeued).toEqual({
      ...job,
      status: "queued",
      progress: 0,
      error: null,
      result: null,
      attempts: 0,
      updatedAt: 2_000,
      startedAt: null,
      finishedAt: null,
    });
    expect(await repo.requeueFailed(job.id)).toBeNull();
    expect(await repo.requeueFailed("tidak-ada")).toBeNull();
  });
});
