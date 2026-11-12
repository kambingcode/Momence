import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILLER_PHRASES,
  DEFAULT_FILLER_WORDS,
  DEFAULT_PAUSE_MS,
  PAUSE_SLIDER_MS,
} from "@/modules/cleanup/application";
import {
  PAUSE_MIN_MS_RANGE,
  type Preferences,
  type StoredPreferences,
  type WorkerStatus,
} from "@/shared/schemas";
import type { SettingsRepository } from "./ports";
import {
  CheckWorkerOnline,
  DEFAULT_PREFERENCES,
  GetPreferences,
  GetSettingsOverview,
  SavePreferences,
} from "./use-cases";

class InMemorySettingsRepository implements SettingsRepository {
  preferences: StoredPreferences | null = null;
  worker: WorkerStatus | null = null;

  async getPreferences() {
    return this.preferences;
  }

  async savePreferences(preferences: Preferences) {
    this.preferences = preferences;
  }

  async getWorkerStatus() {
    return this.worker;
  }
}

const preferences = (overrides: Partial<Preferences> = {}): Preferences => ({
  ...DEFAULT_PREFERENCES,
  ...overrides,
});

describe("settings use cases", () => {
  it("bawaan = daftar & ambang panel Speech cleanup; rentang jeda sama dengan slider", () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      geminiModel: null,
      fillerWords: DEFAULT_FILLER_WORDS,
      fillerPhrases: DEFAULT_FILLER_PHRASES,
      pauseMinMs: DEFAULT_PAUSE_MS,
    });
    expect(PAUSE_MIN_MS_RANGE).toEqual(PAUSE_SLIDER_MS);
  });

  it("GetPreferences: belum disimpan → bawaan; field yang belum ada → bawaan", async () => {
    const repo = new InMemorySettingsRepository();
    const get = new GetPreferences(repo);
    expect(await get.execute()).toEqual(DEFAULT_PREFERENCES);

    repo.preferences = { pauseMinMs: 1200, fillerWords: [] };
    expect(await get.execute()).toEqual(
      preferences({ pauseMinMs: 1200, fillerWords: [] }),
    );
  });

  it("SavePreferences merapikan daftar & model sebelum menyimpan", async () => {
    const repo = new InMemorySettingsRepository();
    const result = await new SavePreferences(repo).execute(
      preferences({
        geminiModel: "  gemini-4-argon ",
        fillerWords: ["Eh", "eh", " anu "],
        fillerPhrases: ["apa   ya"],
      }),
    );
    const saved = preferences({
      geminiModel: "gemini-4-argon",
      fillerWords: ["Eh", "anu"],
      fillerPhrases: ["apa ya"],
    });
    expect(result).toEqual({ status: "saved", preferences: saved });
    expect(repo.preferences).toEqual(saved);
  });

  it("SavePreferences menolak nilai di luar aturan tanpa menyimpan", async () => {
    const repo = new InMemorySettingsRepository();
    const save = new SavePreferences(repo);
    for (const invalid of [
      preferences({ pauseMinMs: 250 }),
      preferences({ pauseMinMs: 550 }),
      preferences({ fillerWords: ["123"] }),
      preferences({ geminiModel: "gemini flash" }),
    ]) {
      expect((await save.execute(invalid)).status).toBe("invalid");
    }
    expect(repo.preferences).toBeNull();
  });

  it("GetSettingsOverview menandai worker online menurut detaknya", async () => {
    const repo = new InMemorySettingsRepository();
    const now = 1_000_000;
    const overview = new GetSettingsOverview(
      repo,
      new GetPreferences(repo),
      { pixabay: false },
      { now: () => now },
    );
    expect(await overview.execute()).toEqual({
      preferences: DEFAULT_PREFERENCES,
      defaults: DEFAULT_PREFERENCES,
      keys: { pixabay: false },
      worker: null,
    });

    repo.worker = {
      geminiApiKey: true,
      geminiModel: "gemini-3.6-flash",
      whisperModel: "w",
      heartbeatAt: now - 5_000,
      stoppedAt: null,
    };
    expect((await overview.execute()).worker?.online).toBe(true);
    repo.worker = { ...repo.worker, heartbeatAt: now - 600_000 };
    expect((await overview.execute()).worker?.online).toBe(false);
  });
});

describe("CheckWorkerOnline", () => {
  it("online hanya bila worker pernah melapor, detaknya segar & belum berhenti", async () => {
    const repo = new InMemorySettingsRepository();
    const now = 1_000_000;
    const check = new CheckWorkerOnline(repo, { now: () => now });
    expect(await check.execute()).toBe(false);

    repo.worker = {
      geminiApiKey: false,
      geminiModel: "m",
      whisperModel: "w",
      heartbeatAt: now - 5_000,
      stoppedAt: null,
    };
    expect(await check.execute()).toBe(true);
    repo.worker = { ...repo.worker, stoppedAt: now - 1_000 };
    expect(await check.execute()).toBe(false);
  });
});
