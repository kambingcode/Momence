import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "@/server/db/client";
import {
  clipReframes,
  clips,
  editingScripts,
  jobs,
  projects,
  sources,
  transcripts,
} from "@/server/db/schema";
import { DrizzleProjectRepository } from "./drizzle-project-repository";

// Tes integrasi: DB SQLite sungguhan dengan migrasi drizzle (termasuk ON DELETE CASCADE).
describe("DrizzleProjectRepository.deleteIfIdle", () => {
  let dir: string;
  let db: Database;
  let repo: DrizzleProjectRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "clipstudio-test-"));
    db = await openDatabase(`file:${path.join(dir, "test.db")}`, dir);
    repo = new DrizzleProjectRepository(db);
  });

  afterEach(async () => {
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function seed(projectId: string, jobStatus: "done" | "running") {
    await repo.create(
      { id: projectId, name: "Video", createdAt: 1 },
      {
        id: `${projectId}-s`,
        projectId,
        originalName: "video.mp4",
        path: `media/${projectId}/source.mp4`,
        sizeBytes: 10,
      },
    );
    await db.insert(transcripts).values({
      id: `${projectId}-t`,
      projectId,
      sourceId: `${projectId}-s`,
      words: [],
    });
    await db.insert(clips).values({
      id: `${projectId}-c`,
      projectId,
      title: "K",
      startMs: 0,
      endMs: 1,
    });
    await db.insert(editingScripts).values({
      id: `${projectId}-e`,
      clipId: `${projectId}-c`,
      script: {},
    });
    await db.insert(clipReframes).values({
      clipId: `${projectId}-c`,
      version: 1,
      startMs: 0,
      endMs: 1,
      analysis: {},
    });
    await db.insert(jobs).values([
      {
        id: `${projectId}-j1`,
        projectId,
        type: "ingest",
        status: "done",
        payload: {},
      },
      {
        id: `${projectId}-j2`,
        projectId,
        type: "render",
        status: jobStatus,
        payload: {},
      },
    ]);
  }

  async function countRows(projectId: string) {
    const rows = await Promise.all([
      db.select().from(projects).where(eq(projects.id, projectId)),
      db.select().from(sources).where(eq(sources.projectId, projectId)),
      db.select().from(transcripts).where(eq(transcripts.projectId, projectId)),
      db.select().from(clips).where(eq(clips.projectId, projectId)),
      db.select().from(editingScripts),
      db.select().from(clipReframes),
      db.select().from(jobs).where(eq(jobs.projectId, projectId)),
    ]);
    return rows.map((r) => r.length);
  }

  it("menghapus proyek beserta semua barisnya, proyek lain utuh", async () => {
    await seed("p1", "done");
    await seed("p2", "done");
    expect(await repo.deleteIfIdle("p1", { allowRunning: false })).toEqual({
      status: "deleted",
    });
    expect(await countRows("p1")).toEqual([0, 0, 0, 0, 1, 1, 0]);
    expect(await countRows("p2")).toEqual([1, 1, 1, 1, 1, 1, 2]);
  });

  it("menolak selama ada job running, tanpa menghapus apa pun", async () => {
    await seed("p1", "running");
    expect(await repo.deleteIfIdle("p1", { allowRunning: false })).toEqual({
      status: "busy",
      jobType: "render",
    });
    expect(await countRows("p1")).toEqual([1, 1, 1, 1, 1, 1, 2]);
  });

  it("allowRunning menghapus walau ada job running", async () => {
    await seed("p1", "running");
    expect(await repo.deleteIfIdle("p1", { allowRunning: true })).toEqual({
      status: "deleted",
    });
    expect(await countRows("p1")).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("not_found untuk proyek yang tidak ada", async () => {
    expect(await repo.deleteIfIdle("hilang", { allowRunning: false })).toEqual({
      status: "not_found",
    });
  });
});

describe("DrizzleProjectRepository fokus klip", () => {
  let dir: string;
  let db: Database;
  let repo: DrizzleProjectRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "clipstudio-test-"));
    db = await openDatabase(`file:${path.join(dir, "test.db")}`, dir);
    repo = new DrizzleProjectRepository(db);
  });

  afterEach(async () => {
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });

  const source = (projectId: string) => ({
    id: `${projectId}-s`,
    projectId,
    originalName: "video.mp4",
    path: `media/${projectId}/source.mp4`,
    sizeBytes: 10,
  });

  it("menyimpan dan membaca ulang fokus klip; tanpa fokus = null", async () => {
    await repo.create(
      { id: "p1", name: "A", clipFocus: "momen lucu", createdAt: 1 },
      source("p1"),
    );
    await repo.create({ id: "p2", name: "B", createdAt: 2 }, source("p2"));

    expect((await repo.get("p1"))?.clipFocus).toBe("momen lucu");
    expect((await repo.get("p2"))?.clipFocus).toBeNull();
    expect((await repo.list(10)).map((p) => p.clipFocus)).toEqual([
      null,
      "momen lucu",
    ]);
  });

  it("setClipFocus mengganti dan menghapus fokus; false untuk proyek tak ada", async () => {
    await repo.create(
      { id: "p1", name: "A", clipFocus: "momen lucu", createdAt: 1 },
      source("p1"),
    );

    expect(await repo.setClipFocus("p1", "tips praktis")).toBe(true);
    expect((await repo.get("p1"))?.clipFocus).toBe("tips praktis");
    expect(await repo.setClipFocus("p1", null)).toBe(true);
    expect((await repo.get("p1"))?.clipFocus).toBeNull();
    expect(await repo.setClipFocus("hilang", "x")).toBe(false);
  });
});
