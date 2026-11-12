import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "@/server/db/client";
import { projects, sources, transcripts } from "@/server/db/schema";
import { DrizzleTranscriptRepository } from "./drizzle-transcript-repository";

// Tes integrasi: DB SQLite sungguhan; baris transkrip meniru yang ditulis worker.
describe("DrizzleTranscriptRepository", () => {
  let dir: string;
  let db: Database;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "clipstudio-test-"));
    db = await openDatabase(`file:${path.join(dir, "test.db")}`, dir);
    await db.insert(projects).values({ id: "p1", name: "Video" });
    await db.insert(sources).values({
      id: "s1",
      projectId: "p1",
      originalName: "a.mp4",
      path: "media/p1/source.mp4",
      sizeBytes: 1,
    });
  });

  afterEach(async () => {
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("membaca transkrip proyek dan memvalidasi tokennya", async () => {
    const words = [
      {
        id: "p1",
        type: "pause",
        text: "",
        startMs: 0,
        endMs: 500,
        confidence: null,
      },
      {
        id: "w1",
        type: "filler",
        text: "Eh,",
        startMs: 500,
        endMs: 700,
        confidence: 0.9,
      },
    ];
    await db.insert(transcripts).values({
      id: "t1",
      projectId: "p1",
      sourceId: "s1",
      language: "id",
      words,
    });
    const repo = new DrizzleTranscriptRepository(db);
    expect(await repo.findByProject("p1")).toEqual({
      id: "t1",
      projectId: "p1",
      sourceId: "s1",
      language: "id",
      tokens: words,
    });
    expect(await repo.findByProject("lain")).toBeNull();
  });

  it("transkrip tanpa ucapan: bahasa null & token kosong", async () => {
    await db.insert(transcripts).values({
      id: "t1",
      projectId: "p1",
      sourceId: "s1",
      language: null,
      words: [],
    });
    expect(
      await new DrizzleTranscriptRepository(db).findByProject("p1"),
    ).toMatchObject({ language: null, tokens: [] });
  });

  it("menolak data yang tidak sesuai skema", async () => {
    await db.insert(transcripts).values({
      id: "t1",
      projectId: "p1",
      sourceId: "s1",
      language: "id",
      words: [{ id: "w1", type: "music" }],
    });
    await expect(
      new DrizzleTranscriptRepository(db).findByProject("p1"),
    ).rejects.toThrow();
  });
});
