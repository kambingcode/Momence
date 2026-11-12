import { describe, expect, it } from "vitest";
import {
  isWorkerOnline,
  normalizeEntries,
  WORKER_STALE_MS,
} from "./preferences";

describe("normalizeEntries", () => {
  it("merapatkan spasi, membuang entri kosong & ganda, mempertahankan urutan", () => {
    expect(
      normalizeEntries(["  apa   ya ", "", "Eh", "eh", "APA YA", "anu", "  "]),
    ).toEqual(["apa ya", "Eh", "anu"]);
  });
});

describe("isWorkerOnline", () => {
  const status = { heartbeatAt: 1_000, stoppedAt: null };

  it("online selama detak terakhir belum lebih tua dari batas", () => {
    expect(isWorkerOnline(status, 1_000 + WORKER_STALE_MS)).toBe(true);
    expect(isWorkerOnline(status, 1_001 + WORKER_STALE_MS)).toBe(false);
  });

  it("worker yang berhenti rapi langsung dianggap mati", () => {
    expect(isWorkerOnline({ ...status, stoppedAt: 1_500 }, 1_600)).toBe(false);
  });
});
