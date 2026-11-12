import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "@/server/db/client";
import { clipReframes, clips, projects } from "@/server/db/schema";
import { DrizzleClipReframeRepository } from "./drizzle-clip-reframe-repository";

// Bentuk kolom `crops` dari worker (tes integrasi test_sqlalchemy_reframe_repository.py).
const fromWorker = {
  "9:16": [
    {
      tMs: 10_000,
      cropRect: { x: 0.3418, y: 0.0, width: 0.3164, height: 1.0 },
    },
  ],
  "1:1": [],
  "16:9": [],
};

// Tes integrasi: DB SQLite sungguhan dari migrasi.
describe("DrizzleClipReframeRepository", () => {
  let dir: string;
  let db: Database;
  let repo: DrizzleClipReframeRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "clipstudio-test-"));
    db = await openDatabase(`file:${path.join(dir, "test.db")}`, dir);
    await db.insert(projects).values({ id: "p1", name: "Video" });
    await db.insert(clips).values(
      ["c1", "c2", "c3"].map((id) => ({
        id,
        projectId: "p1",
        title: "Klip",
        startMs: 10_000,
        endMs: 40_000,
      })),
    );
    repo = new DrizzleClipReframeRepository(db);
  });

  afterEach(async () => {
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });

  const row = (clipId: string, crops: unknown) => ({
    clipId,
    version: 1,
    startMs: 10_000,
    endMs: 40_000,
    analysis: { samples: [] },
    cropVersion: crops === null ? null : 1,
    crops,
  });

  it("membaca crop per rasio dari worker", async () => {
    await db.insert(clipReframes).values(row("c1", fromWorker));
    expect(await repo.findByClipId("c1")).toEqual({
      startMs: 10_000,
      endMs: 40_000,
      crops: fromWorker,
    });
  });

  it("baris tanpa crop atau crop rusak → crops null; tanpa baris → null", async () => {
    await db
      .insert(clipReframes)
      .values([row("c2", null), row("c3", { "9:16": "rusak" })]);
    expect((await repo.findByClipId("c2"))?.crops).toBeNull();
    expect((await repo.findByClipId("c3"))?.crops).toBeNull();
    expect(await repo.findByClipId("c1")).toBeNull();
  });
});
