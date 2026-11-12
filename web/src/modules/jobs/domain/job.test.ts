import { describe, expect, it } from "vitest";
import {
  type Job,
  canTransition,
  latestPerType,
  normalizeProgress,
} from "./job";

describe("canTransition", () => {
  it("mengikuti alur queued → running → done|failed", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "done")).toBe(true);
    expect(canTransition("running", "failed")).toBe(true);
  });

  it("menolak lompatan dan perubahan dari status akhir", () => {
    expect(canTransition("queued", "done")).toBe(false);
    expect(canTransition("done", "running")).toBe(false);
  });

  it("mengizinkan retry job gagal", () => {
    expect(canTransition("failed", "queued")).toBe(true);
  });
});

describe("normalizeProgress", () => {
  it("membulatkan dan membatasi ke 0–100", () => {
    expect(normalizeProgress(42.6)).toBe(43);
    expect(normalizeProgress(-5)).toBe(0);
    expect(normalizeProgress(150)).toBe(100);
    expect(normalizeProgress(Number.NaN)).toBe(0);
  });
});

describe("latestPerType", () => {
  const job = (type: string, createdAt: number): Job => ({
    id: `${type}-${createdAt}`,
    projectId: "p",
    type,
    status: "queued",
    progress: 0,
    payload: {},
    result: null,
    error: null,
    attempts: 0,
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    finishedAt: null,
  });

  it("menyimpan job terbaru per tipe, urut waktu dibuat", () => {
    const result = latestPerType([
      job("transcribe", 5),
      job("ingest", 1),
      job("ingest", 3),
    ]);
    expect(result.map((j) => j.id)).toEqual(["ingest-3", "transcribe-5"]);
  });
});
