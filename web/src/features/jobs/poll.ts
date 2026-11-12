import type { Job } from "@/modules/jobs/application";

/** Interval polling selama masih ada job yang berjalan/antre; `false` = berhenti. */
export function jobsPollInterval(
  jobs: readonly Pick<Job, "status">[] | undefined,
): number | false {
  const statuses = (jobs ?? []).map((job) => job.status);
  if (statuses.includes("running")) return 1000;
  if (statuses.includes("queued")) return 2000;
  return false;
}
