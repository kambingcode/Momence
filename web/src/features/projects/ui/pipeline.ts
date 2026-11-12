import { JOB_LABELS } from "@/features/jobs/labels";
import type { Job } from "@/modules/jobs/application";

/** Keadaan satu segmen pipeline. */
export type SegmentState = "done" | "running" | "failed" | "queued" | "pending";

export interface PipelineSegment {
  id: "ingest" | "transcribe" | "discover" | "reframe";
  state: SegmentState;
  /** 0–100: isian segmen (penuh bila selesai/gagal/menunggu, sesuai progres bila berjalan). */
  progress: number;
}

/** `empty` = belum ada proses; `incomplete` = berhenti sebelum klip ditemukan tanpa job aktif. */
export type PipelineStatus =
  "empty" | "running" | "queued" | "failed" | "done" | "incomplete";

export interface PipelineSummary {
  segments: PipelineSegment[];
  status: PipelineStatus;
  /** Teks status untuk pengguna, mis. "Transkripsi 47%". */
  label: string;
  /** Tingkat baris: gagal menonjol, berjalan/menunggu diberi tint, selebihnya biasa. */
  tone: "idle" | "running" | "failed";
  /** Job gagal pertama menurut urutan pipeline (untuk "Coba lagi"). */
  failedJob: Job | null;
}

/**
 * Urutan pipeline; unduhan dan ingest berbagi satu segmen ("menyiapkan video"), unduhan audio
 * berbagi segmen dengan transkripsi. Unduhan video/ingest berjalan bersamaan dengan transkripsi &
 * pencarian klip (impor link), jadi beberapa segmen bisa "berjalan" sekaligus.
 */
const STAGES: ReadonlyArray<{ id: PipelineSegment["id"]; types: string[] }> = [
  { id: "ingest", types: ["download", "ingest"] },
  { id: "transcribe", types: ["download-audio", "transcribe"] },
  { id: "discover", types: ["discover"] },
  { id: "reframe", types: ["reframe"] },
];

/** Dipakai setelah "Gagal di …". */
const FAILURE_NAMES: Record<string, string> = {
  download: "Unduhan video",
  "download-audio": "Unduhan audio",
  ingest: "Persiapan video",
  transcribe: "Transkripsi",
  discover: "Pencarian klip",
  reframe: "Analisis wajah",
};

function stageOf(jobs: Job[]): { state: SegmentState; progress: number } {
  const running = jobs.find((job) => job.status === "running");
  if (running) return { state: "running", progress: running.progress };
  if (jobs.some((job) => job.status === "failed"))
    return { state: "failed", progress: 100 };
  if (jobs.some((job) => job.status === "queued"))
    return { state: "queued", progress: 100 };
  if (jobs.length > 0) return { state: "done", progress: 100 };
  return { state: "pending", progress: 0 };
}

/**
 * Ringkas job proyek (satu per tipe, lihat `latestPerType`) menjadi 4 segmen pipeline + status.
 * Job di luar pipeline (render, B-roll, uji) diabaikan.
 */
export function summarizePipeline(jobs: readonly Job[]): PipelineSummary {
  const stageJobs = STAGES.map((stage) =>
    jobs.filter((job) => stage.types.includes(job.type)),
  );
  const segments = STAGES.map((stage, index) => ({
    id: stage.id,
    ...stageOf(stageJobs[index]),
  }));

  // Urutan pipeline, bukan urutan data: unduhan sebelum ingest.
  const inOrder = STAGES.flatMap((stage, index) =>
    [...stageJobs[index]].sort(
      (a, b) => stage.types.indexOf(a.type) - stage.types.indexOf(b.type),
    ),
  );
  const failedJob = inOrder.find((job) => job.status === "failed") ?? null;
  const runningJob = inOrder.find((job) => job.status === "running");
  const queued = inOrder.some((job) => job.status === "queued");

  if (failedJob) {
    return {
      segments,
      status: "failed",
      label: `Gagal di ${FAILURE_NAMES[failedJob.type] ?? failedJob.type}`,
      tone: "failed",
      failedJob,
    };
  }
  if (runningJob) {
    const name = JOB_LABELS[runningJob.type] ?? runningJob.type;
    return {
      segments,
      status: "running",
      label: `${name} ${runningJob.progress}%`,
      tone: "running",
      failedJob: null,
    };
  }
  if (queued) {
    return {
      segments,
      status: "queued",
      label: "Menunggu antrean",
      tone: "running",
      failedJob: null,
    };
  }
  if (inOrder.length === 0) {
    return {
      segments,
      status: "empty",
      label: "Belum ada proses",
      tone: "idle",
      failedJob: null,
    };
  }
  const discovered =
    segments.find((s) => s.id === "discover")?.state === "done";
  return {
    segments,
    status: discovered ? "done" : "incomplete",
    label: discovered ? "Selesai" : "Belum selesai",
    tone: "idle",
    failedJob: null,
  };
}
