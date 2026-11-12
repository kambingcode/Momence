"use client";

import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Job } from "@/modules/jobs/application";
import { JOB_LABELS } from "../labels";
import { useWorkerDown } from "../use-worker-down";
import { RetryJobButton } from "./retry-job-button";

const STATUS_LABELS: Record<Job["status"], string> = {
  queued: "Menunggu",
  running: "Berjalan",
  done: "Selesai",
  failed: "Gagal",
};

/** Status dibedakan bentuk ikon (monokrom); merah hanya untuk gagal. */
function StatusIcon({ status }: { status: Job["status"] }) {
  switch (status) {
    case "queued":
      return (
        <CircleDashed className="text-muted-foreground size-4" aria-hidden />
      );
    case "running":
      return (
        <Loader2 className="text-foreground size-4 animate-spin" aria-hidden />
      );
    case "done":
      return <CheckCircle2 className="text-foreground size-4" aria-hidden />;
    case "failed":
      return <XCircle className="text-destructive size-4" aria-hidden />;
  }
}

export function JobStatus({
  job,
  workerWarning = true,
}: {
  job: Job;
  /** `false` bila halaman sudah menampilkan satu `WorkerBanner` untuk semua job. */
  workerWarning?: boolean;
}) {
  const label = JOB_LABELS[job.type] ?? job.type;
  const pending = job.status === "queued" || job.status === "running";
  const workerDown = useWorkerDown(pending) && workerWarning;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <StatusIcon status={job.status} />
        <span>{label}</span>
        <span className="label-mono text-muted-foreground ml-auto text-sm tabular-nums">
          {job.status === "running"
            ? `${job.progress}%`
            : STATUS_LABELS[job.status]}
        </span>
      </div>
      {job.status === "running" && (
        <Progress
          value={job.progress}
          aria-label={`${label} ${job.progress}%`}
        />
      )}
      {workerDown && (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            {job.status === "running"
              ? "Worker berhenti di tengah job ini; job diulang otomatis saat worker dijalankan lagi"
              : "Worker tidak berjalan"}{" "}
            (<code>uv run worker run</code> di worker/).
          </span>
        </p>
      )}
      {job.status === "failed" && (
        <div className="space-y-1.5">
          {job.error && (
            <p className="text-destructive text-xs break-words">{job.error}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <RetryJobButton job={job} />
          </div>
        </div>
      )}
    </div>
  );
}
