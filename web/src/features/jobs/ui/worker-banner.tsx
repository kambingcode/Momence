"use client";

import { TriangleAlert } from "lucide-react";
import type { Job } from "@/modules/jobs/application";
import { useWorkerDown } from "../use-worker-down";

/** Satu peringatan untuk seluruh daftar bila ada job menunggu tetapi worker tidak berjalan. */
export function WorkerBanner({ jobs }: { jobs: Pick<Job, "status">[] }) {
  const running = jobs.some((job) => job.status === "running");
  const pending = running || jobs.some((job) => job.status === "queued");
  const workerDown = useWorkerDown(pending);
  if (!workerDown) return null;

  return (
    <div
      role="status"
      className="bg-secondary text-foreground flex items-start gap-2 rounded-lg border px-4 py-3 text-sm"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <strong className="label-mono">Worker tidak berjalan.</strong>{" "}
        {running
          ? "Job yang sedang dikerjakan terhenti; job diulang otomatis saat worker dijalankan lagi"
          : "Job menunggu worker"}{" "}
        (<code>uv run worker run</code> di worker/).
      </p>
    </div>
  );
}
