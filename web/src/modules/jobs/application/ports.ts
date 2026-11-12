import type { JobType } from "@/shared/schemas";
import type { Job } from "../domain/job";

export interface NewJob {
  projectId: string | null;
  type: JobType;
  payload: unknown;
}

export interface JobRepository {
  enqueue(job: NewJob): Promise<Job>;
  findById(id: string): Promise<Job | null>;
  /** Terbaru dulu. */
  list(filter: { projectId?: string; limit: number }): Promise<Job[]>;
  /** Semua job milik proyek-proyek ini (tanpa batas; per proyek hanya sedikit). */
  listForProjects(projectIds: readonly string[]): Promise<Job[]>;
  /**
   * Job `failed` → `queued` dari awal (progres, galat, hasil & `attempts` direset; `createdAt`
   * tetap sehingga urutan antrean semula dipertahankan). `null` bila job tidak (lagi) `failed`.
   */
  requeueFailed(id: string): Promise<Job | null>;
}
