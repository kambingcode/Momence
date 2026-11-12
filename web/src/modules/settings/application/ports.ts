import type {
  Preferences,
  StoredPreferences,
  WorkerStatus,
} from "@/shared/schemas";

export interface SettingsRepository {
  /** `null` = belum pernah disimpan; baris rusak dianggap belum ada. */
  getPreferences(): Promise<StoredPreferences | null>;
  savePreferences(preferences: Preferences): Promise<void>;
  /** `null` = worker belum pernah jalan sejak tabel dibuat, atau baris rusak. */
  getWorkerStatus(): Promise<WorkerStatus | null>;
}

export interface Clock {
  now(): number;
}
