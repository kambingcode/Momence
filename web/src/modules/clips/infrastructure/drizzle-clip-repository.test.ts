import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "@/server/db/client";
import { clips, projects } from "@/server/db/schema";
import { DrizzleClipRepository } from "./drizzle-clip-repository";

// Tes integrasi: DB SQLite sungguhan; details meniru `details_to_json` di worker.
const details = {
  sourceId: "s1",
  rawScore: 6.5,
  hook: "Hook",
  startTokenId: "w1",
  endTokenId: "w9",
  keywords: ["nabung", "darurat"],
  subscores: {
    hook: { score: 8, comment: "a" },
    flow: { score: 7, comment: "b" },
    value: { score: 6, comment: "c" },
    trend: { score: 5, comment: "d" },
  },
};

describe("DrizzleClipRepository", () => {
  let dir: string;
  let db: Database;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "clipstudio-test-"));
    db = await openDatabase(`file:${path.join(dir, "test.db")}`, dir);
    await db.insert(projects).values([
      { id: "p1", name: "Video" },
      { id: "p2", name: "Lain" },
    ]);
  });

  afterEach(async () => {
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("membaca klip proyek dan memvalidasi details", async () => {
    await db.insert(clips).values([
      {
        id: "c1",
        projectId: "p1",
        title: "Judul",
        startMs: 10_000,
        endMs: 40_000,
        score: 99,
        rank: 1,
        details,
      },
      {
        id: "c2",
        projectId: "p2",
        title: "Milik p2",
        startMs: 0,
        endMs: 30_000,
        details,
      },
    ]);
    expect(await new DrizzleClipRepository(db).listByProject("p1")).toEqual([
      {
        id: "c1",
        projectId: "p1",
        title: "Judul",
        startMs: 10_000,
        endMs: 40_000,
        score: 99,
        rank: 1,
        details,
      },
    ]);
  });

  it("get: satu klip menurut id, null bila tidak ada", async () => {
    await db.insert(clips).values({
      id: "c1",
      projectId: "p1",
      title: "Judul",
      startMs: 0,
      endMs: 30_000,
      details,
    });
    const repo = new DrizzleClipRepository(db);
    expect(await repo.get("c1")).toMatchObject({ id: "c1", details });
    expect(await repo.get("hilang")).toBeNull();
  });

  it("menolak details yang tidak sesuai skema", async () => {
    await db.insert(clips).values({
      id: "c1",
      projectId: "p1",
      title: "Judul",
      startMs: 0,
      endMs: 30_000,
      details: { ...details, subscores: {} },
    });
    await expect(
      new DrizzleClipRepository(db).listByProject("p1"),
    ).rejects.toThrow();
  });

  describe("summarizeByProject", () => {
    const clip = (id: string, projectId: string, detailsValue: unknown) => ({
      id,
      projectId,
      title: id,
      startMs: 0,
      endMs: 30_000,
      details: detailsValue,
    });

    it("jumlah klip & rawScore tertinggi per proyek, hanya proyek yang diminta", async () => {
      await db.insert(projects).values({ id: "p3", name: "Tidak diminta" });
      await db
        .insert(clips)
        .values([
          clip("c1", "p1", { ...details, rawScore: 6.5 }),
          clip("c2", "p1", { ...details, rawScore: 8.25 }),
          clip("c3", "p1", { ...details, rawScore: 7 }),
          clip("c4", "p2", { ...details, rawScore: 9 }),
          clip("c5", "p3", details),
        ]);
      const summary = await new DrizzleClipRepository(db).summarizeByProject([
        "p1",
        "p2",
        "tanpa-klip",
      ]);
      expect(summary).toEqual(
        new Map([
          ["p1", { count: 3, bestRawScore: 8.25 }],
          ["p2", { count: 1, bestRawScore: 9 }],
        ]),
      );
    });

    it("rawScore yang bukan angka, details kosong, atau JSON rusak tetap dihitung tanpa skor", async () => {
      await db
        .insert(clips)
        .values([
          clip("c1", "p1", { ...details, rawScore: "9" }),
          clip("c2", "p1", null),
          clip("c3", "p1", details),
          clip("c4", "p2", { ...details, rawScore: undefined }),
        ]);
      await db.run(sql`update clips set details = '{rusak' where id = 'c3'`);
      const summary = await new DrizzleClipRepository(db).summarizeByProject([
        "p1",
        "p2",
      ]);
      expect(summary).toEqual(
        new Map([
          ["p1", { count: 3, bestRawScore: null }],
          ["p2", { count: 1, bestRawScore: null }],
        ]),
      );
    });

    it("daftar kosong tidak menjalankan kueri", async () => {
      expect(
        await new DrizzleClipRepository(db).summarizeByProject([]),
      ).toEqual(new Map());
    });
  });
});
