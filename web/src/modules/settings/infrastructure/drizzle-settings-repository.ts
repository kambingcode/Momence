import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { settings } from "@/server/db/schema";
import {
  type Preferences,
  type StoredPreferences,
  storedPreferencesSchema,
  type WorkerStatus,
  workerStatusSchema,
} from "@/shared/schemas";
import type { SettingsRepository } from "../application";

const PREFERENCES_KEY = "preferences";
const WORKER_KEY = "worker";

export class DrizzleSettingsRepository implements SettingsRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  async getPreferences(): Promise<StoredPreferences | null> {
    const parsed = storedPreferencesSchema.safeParse(
      await this.read(PREFERENCES_KEY),
    );
    return parsed.success ? parsed.data : null;
  }

  async savePreferences(preferences: Preferences): Promise<void> {
    const now = this.now();
    await this.db
      .insert(settings)
      .values({ key: PREFERENCES_KEY, value: preferences, updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: preferences, updatedAt: now },
      });
  }

  async getWorkerStatus(): Promise<WorkerStatus | null> {
    const parsed = workerStatusSchema.safeParse(await this.read(WORKER_KEY));
    return parsed.success ? parsed.data : null;
  }

  private async read(key: string): Promise<unknown> {
    const row = await this.db.query.settings.findFirst({
      where: eq(settings.key, key),
    });
    return row?.value ?? null;
  }
}
