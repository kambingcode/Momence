import { describe, expect, it } from "vitest";
import type { Job } from "@/modules/jobs/application";
import { summarizePipeline } from "./pipeline";

let counter = 0;
function job(
  type: string,
  status: Job["status"],
  progress = status === "done" ? 100 : 0,
): Job {
  counter += 1;
  return {
    id: `j${counter}`,
    projectId: "p1",
    type,
    status,
    progress,
    payload: {},
    result: null,
    error: null,
    attempts: 1,
    createdAt: counter,
    updatedAt: counter,
    startedAt: null,
    finishedAt: null,
  };
}

const states = (jobs: Job[]) =>
  summarizePipeline(jobs).segments.map((s) => s.state);

describe("summarizePipeline", () => {
  it("tanpa job → semua menunggu giliran, 'Belum ada proses'", () => {
    expect(summarizePipeline([])).toMatchObject({
      status: "empty",
      label: "Belum ada proses",
      tone: "idle",
      failedJob: null,
      segments: [
        { id: "ingest", state: "pending", progress: 0 },
        { id: "transcribe", state: "pending", progress: 0 },
        { id: "discover", state: "pending", progress: 0 },
        { id: "reframe", state: "pending", progress: 0 },
      ],
    });
  });

  it("semua selesai → 'Selesai', baris biasa", () => {
    const summary = summarizePipeline([
      job("ingest", "done"),
      job("transcribe", "done"),
      job("discover", "done"),
      job("reframe", "done"),
    ]);
    expect(summary).toMatchObject({
      status: "done",
      label: "Selesai",
      tone: "idle",
    });
    expect(states([job("ingest", "done")])).toEqual([
      "done",
      "pending",
      "pending",
      "pending",
    ]);
    expect(summary.segments.every((s) => s.progress === 100)).toBe(true);
  });

  it("klip ditemukan tanpa job reframe (mis. tanpa klip) tetap 'Selesai'", () => {
    expect(
      summarizePipeline([
        job("ingest", "done"),
        job("transcribe", "done"),
        job("discover", "done"),
      ]),
    ).toMatchObject({ status: "done", label: "Selesai" });
  });

  it("job berjalan → label dengan progres, segmen terisi sebesar progres", () => {
    const summary = summarizePipeline([
      job("ingest", "done"),
      job("transcribe", "running", 47),
    ]);
    expect(summary).toMatchObject({
      status: "running",
      label: "Transkripsi 47%",
      tone: "running",
    });
    expect(summary.segments[1]).toEqual({
      id: "transcribe",
      state: "running",
      progress: 47,
    });
  });

  it.each([
    ["download", "Mengunduh video 12%"],
    ["ingest", "Menyiapkan video 12%"],
    ["discover", "Mencari klip 12%"],
    ["reframe", "Analisis wajah 12%"],
  ])("label job berjalan %s", (type, label) => {
    expect(summarizePipeline([job(type, "running", 12)]).label).toBe(label);
  });

  it("unduhan dan ingest berbagi segmen pertama", () => {
    expect(states([job("download", "done"), job("ingest", "queued")])).toEqual([
      "queued",
      "pending",
      "pending",
      "pending",
    ]);
    expect(
      summarizePipeline([
        job("download", "running", 30),
        job("ingest", "queued"),
      ]).segments[0],
    ).toEqual({ id: "ingest", state: "running", progress: 30 });
    expect(states([job("download", "done"), job("ingest", "done")])).toEqual([
      "done",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("hanya antre → 'Menunggu antrean', tint seperti berjalan", () => {
    const summary = summarizePipeline([
      job("ingest", "done"),
      job("transcribe", "queued"),
    ]);
    expect(summary).toMatchObject({
      status: "queued",
      label: "Menunggu antrean",
      tone: "running",
      failedJob: null,
    });
    expect(summary.segments[1].state).toBe("queued");
  });

  it("gagal → 'Gagal di …', baris gagal, job gagal tersedia untuk Coba lagi", () => {
    const failed = job("reframe", "failed");
    const summary = summarizePipeline([
      job("ingest", "done"),
      job("transcribe", "done"),
      job("discover", "done"),
      failed,
    ]);
    expect(summary).toMatchObject({
      status: "failed",
      label: "Gagal di Analisis wajah",
      tone: "failed",
      failedJob: failed,
    });
    expect(summary.segments[3].state).toBe("failed");
  });

  it.each([
    ["download", "Gagal di Unduhan video"],
    ["ingest", "Gagal di Persiapan video"],
    ["transcribe", "Gagal di Transkripsi"],
    ["discover", "Gagal di Pencarian klip"],
  ])("label gagal %s", (type, label) => {
    expect(summarizePipeline([job(type, "failed")]).label).toBe(label);
  });

  it("gagal mengalahkan berjalan; job gagal pertama menurut urutan pipeline", () => {
    const transcribe = job("transcribe", "failed");
    const summary = summarizePipeline([
      job("reframe", "failed"),
      job("discover", "running", 10),
      transcribe,
    ]);
    expect(summary.label).toBe("Gagal di Transkripsi");
    expect(summary.failedJob).toBe(transcribe);
  });

  it("berjalan mengalahkan antre", () => {
    expect(
      summarizePipeline([
        job("discover", "queued"),
        job("transcribe", "running", 5),
      ]).label,
    ).toBe("Transkripsi 5%");
  });

  it("job di luar pipeline (render, B-roll, uji) diabaikan", () => {
    expect(
      summarizePipeline([
        job("render", "failed"),
        job("broll-plan", "running", 50),
        job("noop", "queued"),
      ]),
    ).toMatchObject({ status: "empty", tone: "idle", failedJob: null });
    expect(
      summarizePipeline([
        job("ingest", "done"),
        job("transcribe", "done"),
        job("discover", "done"),
        job("render", "running", 20),
      ]).status,
    ).toBe("done");
  });

  it("berhenti sebelum klip ditemukan tanpa job aktif → 'Belum selesai'", () => {
    expect(
      summarizePipeline([job("ingest", "done"), job("transcribe", "done")]),
    ).toMatchObject({
      status: "incomplete",
      label: "Belum selesai",
      tone: "idle",
    });
  });

  it("impor link: unduhan audio di segmen transkripsi, video & transkripsi berjalan bersamaan", () => {
    const summary = summarizePipeline([
      job("download-audio", "done"),
      job("transcribe", "running", 40),
      job("download", "running", 70),
    ]);
    expect(summary.segments.map((s) => [s.id, s.state, s.progress])).toEqual([
      ["ingest", "running", 70],
      ["transcribe", "running", 40],
      ["discover", "pending", 0],
      ["reframe", "pending", 0],
    ]);
    // Label menyebut job pertama menurut urutan pipeline: video (segmen "ingest").
    expect(summary).toMatchObject({ status: "running", tone: "running" });
  });

  it("unduhan audio sedang berjalan → segmen transkripsi berjalan dengan namanya", () => {
    const summary = summarizePipeline([
      job("download-audio", "running", 30),
      job("download", "queued"),
    ]);
    expect(summary.segments[1]).toMatchObject({
      id: "transcribe",
      state: "running",
      progress: 30,
    });
  });

  it("unduhan audio gagal → 'Gagal di Unduhan audio' dengan job untuk Coba lagi", () => {
    const failed = job("download-audio", "failed");
    expect(
      summarizePipeline([failed, job("download", "running", 20)]),
    ).toMatchObject({
      status: "failed",
      label: "Gagal di Unduhan audio",
      failedJob: failed,
    });
  });

  it("klip sudah ada tetapi video masih diunduh → belum 'Selesai'", () => {
    expect(
      summarizePipeline([
        job("download-audio", "done"),
        job("transcribe", "done"),
        job("discover", "done"),
        job("download", "running", 55),
      ]),
    ).toMatchObject({ status: "running" });
  });
});
