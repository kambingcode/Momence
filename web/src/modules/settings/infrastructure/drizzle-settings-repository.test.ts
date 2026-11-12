import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Database, openDatabase } from "@/server/db/client";
import { settings } from "@/server/db/schema";
import { DEFAULT_PREFERENCES } from "../application";
import { DrizzleSettingsRepository } from "./drizzle-settings-repository";

// Tes integrasi: DB SQLite sungguhan dari migrasi.
describe("DrizzleSettingsRepository", () => {
  let dir: string;
  let db: Database;
  let repo: DrizzleSettingsRepository;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "clipstudio-test-"));
    db = await openDatabase(`file:${path.join(dir, "test.db")}`, dir);
    repo = new DrizzleSettingsRepository(db);
  });

  afterEach(async () => {
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("menyimpan lalu menimpa preferences", async () => {
    expect(await repo.getPreferences()).toBeNull();
    await repo.savePreferences(DEFAULT_PREFERENCES);
    const changed = { ...DEFAULT_PREFERENCES, pauseMinMs: 900 };
    await repo.savePreferences(changed);
    expect(await repo.getPreferences()).toEqual(changed);
    expect(await db.select().from(settings)).toHaveLength(1);
  });

  it("membaca status worker; baris rusak → null", async () => {
    // Bentuk yang ditulis worker (test_sqlalchemy_settings_repository.py).
    const status = {
      geminiApiKey: true,
      geminiModel: "gemini-3.6-flash",
      whisperModel: "mlx-community/whisper-large-v3-turbo",
      heartbeatAt: 1_700_000_000_000,
      stoppedAt: null,
    };
    expect(await repo.getWorkerStatus()).toBeNull();
    await db.insert(settings).values({ key: "worker", value: status });
    expect(await repo.getWorkerStatus()).toEqual(status);

    await db
      .insert(settings)
      .values({ key: "preferences", value: { pauseMinMs: "lama" } });
    expect(await repo.getPreferences()).toBeNull();
  });
});
