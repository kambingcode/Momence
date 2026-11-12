import { describe, expect, it } from "vitest";
import { jobsPollInterval } from "./poll";

describe("jobsPollInterval", () => {
  it("lebih sering saat ada job berjalan, berhenti bila semua selesai", () => {
    expect(jobsPollInterval([{ status: "done" }, { status: "running" }])).toBe(
      1000,
    );
    expect(jobsPollInterval([{ status: "queued" }])).toBe(2000);
    expect(jobsPollInterval([{ status: "done" }, { status: "failed" }])).toBe(
      false,
    );
    expect(jobsPollInterval(undefined)).toBe(false);
  });
});
