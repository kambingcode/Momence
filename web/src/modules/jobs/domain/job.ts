export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface Job {
  id: string;
  projectId: string | null;
  type: string;
  status: JobStatus;
  /** 0–100 */
  progress: number;
  payload: unknown;
  result: unknown;
  error: string | null;
  attempts: number;
  /** Epoch milidetik. */
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["running"],
  running: ["done", "failed"],
  done: [],
  // Retry memasukkan job gagal kembali ke antrean.
  failed: ["queued"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isFinished(status: JobStatus): boolean {
  return status === "done" || status === "failed";
}

/** Job terbaru untuk tiap tipe (retry/antrean ulang menggantikan yang lama), urut waktu dibuat. */
export function latestPerType(jobs: readonly Job[]): Job[] {
  const latest = new Map<string, Job>();
  for (const job of jobs) {
    const current = latest.get(job.type);
    if (!current || job.createdAt > current.createdAt)
      latest.set(job.type, job);
  }
  return [...latest.values()].sort((a, b) => a.createdAt - b.createdAt);
}

/** Progres disimpan sebagai bilangan bulat 0–100. */
export function normalizeProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
