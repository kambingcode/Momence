import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "@/server/db/client";
import { clips, editingScripts, projects } from "@/server/db/schema";
import {
  type EditingScript,
  emptyEditingScriptInput,
} from "@/shared/schemas/editing-script";
import { DrizzleEditingScriptRepository } from "./drizzle-editing-script-repository";

const script = (fingerprint: string): EditingScript => ({
  ...emptyEditingScriptInput(),
  removed: [{ removalId: "r1", tokenIds: ["w1"], kind: "manual" }],
  transcriptFingerprint: fingerprint,
});

// Tes integrasi: DB SQLite sungguhan dari migrasi.
describe("DrizzleEditingScriptRepository", () => {
  let dir: string;
  let db: Database;
  let repo: DrizzleEditingScriptRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "clipstudio-test-"));
    db = await openDatabase(`file:${path.join(dir, "test.db")}`, dir);
    await db.insert(projects).values({ id: "p1", name: "Video" });
    await db.insert(clips).values({
      id: "c1",
      projectId: "p1",
      title: "Klip",
      startMs: 0,
      endMs: 30_000,
    });
    let time = 1_000;
    repo = new DrizzleEditingScriptRepository(db, () => (time += 1));
  });

  afterEach(async () => {
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("simpan pertama → versi 1, berikutnya naik; get mengembalikan yang terakhir", async () => {
    expect(await repo.get("c1")).toBeNull();
    const first = await repo.save("c1", script("a"), null);
    expect(first).toEqual({
      status: "saved",
      saved: {
        clipId: "c1",
        version: 1,
        script: script("a"),
        updatedAt: 1_001,
      },
    });
    const second = await repo.save("c1", script("b"), 1);
    expect(second).toMatchObject({
      status: "saved",
      saved: { version: 2, updatedAt: 1_002 },
    });
    expect(await repo.get("c1")).toMatchObject({
      version: 2,
      script: script("b"),
    });
  });

  it("versi tidak cocok → conflict tanpa mengubah data", async () => {
    await repo.save("c1", script("a"), null);
    expect(await repo.save("c1", script("b"), null)).toMatchObject({
      status: "conflict",
      current: { version: 1, script: script("a") },
    });
    expect(await repo.save("c1", script("b"), 5)).toMatchObject({
      status: "conflict",
      current: { version: 1 },
    });
    expect(await repo.save("c2", script("b"), 1)).toEqual({
      status: "conflict",
      current: null,
    });
  });

  it("ikut terhapus bila klipnya dihapus (cascade)", async () => {
    await repo.save("c1", script("a"), null);
    await db.delete(clips);
    expect(await db.select().from(editingScripts)).toEqual([]);
  });
});
