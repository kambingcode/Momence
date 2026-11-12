import {
  DEFAULT_FILLER_PHRASES,
  DEFAULT_FILLER_WORDS,
  DEFAULT_PAUSE_MS,
} from "@/modules/cleanup/application";
import {
  type Preferences,
  preferencesSchema,
  type WorkerStatus,
} from "@/shared/schemas";
import { isWorkerOnline, normalizeEntries } from "../domain/preferences";
import type { Clock, SettingsRepository } from "./ports";

/** Nilai bawaan; sama dengan default worker (`DEFAULT_FILLER_WORDS` di markers.py). */
export const DEFAULT_PREFERENCES: Preferences = {
  geminiModel: null,
  fillerWords: [...DEFAULT_FILLER_WORDS],
  fillerPhrases: [...DEFAULT_FILLER_PHRASES],
  pauseMinMs: DEFAULT_PAUSE_MS,
};

/** Pengaturan yang berlaku: yang tersimpan, field yang belum pernah disimpan = bawaan. */
export class GetPreferences {
  constructor(private readonly settings: SettingsRepository) {}

  async execute(): Promise<Preferences> {
    const stored = await this.settings.getPreferences();
    return { ...DEFAULT_PREFERENCES, ...stored };
  }
}

export type SavePreferencesResult =
  | { status: "saved"; preferences: Preferences }
  | { status: "invalid"; message: string };

export class SavePreferences {
  constructor(private readonly settings: SettingsRepository) {}

  async execute(input: Preferences): Promise<SavePreferencesResult> {
    const preferences: Preferences = {
      ...input,
      geminiModel: input.geminiModel?.trim() || null,
      fillerWords: normalizeEntries(input.fillerWords),
      fillerPhrases: normalizeEntries(input.fillerPhrases),
    };
    // Validasi ulang setelah dirapikan (mis. entri yang menjadi kosong sudah dibuang).
    const parsed = preferencesSchema.safeParse(preferences);
    if (!parsed.success)
      return {
        status: "invalid",
        message: parsed.error.issues[0]?.message ?? "Pengaturan tidak valid",
      };
    await this.settings.savePreferences(parsed.data);
    return { status: "saved", preferences: parsed.data };
  }
}

export interface SettingsOverview {
  preferences: Preferences;
  defaults: Preferences;
  /** Hanya status terisi/tidak; nilai key tidak pernah dikirim. */
  keys: { pixabay: boolean };
  /** `null` = worker belum pernah melapor. */
  worker: (WorkerStatus & { online: boolean }) | null;
}

/** Data halaman Settings: pengaturan + status key & worker. */
export class GetSettingsOverview {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly preferences: GetPreferences,
    private readonly keys: { pixabay: boolean },
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<SettingsOverview> {
    const [preferences, worker] = await Promise.all([
      this.preferences.execute(),
      this.settings.getWorkerStatus(),
    ]);
    return {
      preferences,
      defaults: DEFAULT_PREFERENCES,
      keys: this.keys,
      worker: worker && {
        ...worker,
        online: isWorkerOnline(worker, this.clock.now()),
      },
    };
  }
}

/** Apakah worker sedang berjalan menurut detak terakhirnya (belum pernah melapor = tidak). */
export class CheckWorkerOnline {
  constructor(
    private readonly settings: Pick<SettingsRepository, "getWorkerStatus">,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<boolean> {
    const worker = await this.settings.getWorkerStatus();
    return worker !== null && isWorkerOnline(worker, this.clock.now());
  }
}
