import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDuration,
  formatRelativeTime,
  formatStorageBreakdown,
} from "./format";

describe("format", () => {
  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(1073741824)).toBe("1 GB");
    expect(formatBytes(250 * 1024 * 1024)).toBe("250 MB");
  });

  it("formatDuration", () => {
    expect(formatDuration(9_000)).toBe("0:09");
    expect(formatDuration(754_400)).toBe("12:34");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
  });

  it("formatRelativeTime", () => {
    const now = 1_000_000_000;
    expect(formatRelativeTime(now - 5_000, now)).toBe("5 detik yang lalu");
    expect(formatRelativeTime(now - 3 * 60_000, now)).toBe("3 menit yang lalu");
    expect(formatRelativeTime(now - 2 * 3_600_000, now)).toBe(
      "2 jam yang lalu",
    );
  });
});

describe("formatStorageBreakdown", () => {
  it("hanya jenis yang terisi, urut tetap", () => {
    expect(
      formatStorageBreakdown({
        source: 100 * 1024 * 1024,
        proxy: 40 * 1024 * 1024,
        audio: 0,
        renders: 1536 * 1024,
        other: 0,
        total: 0,
      }),
    ).toBe("Video asli 100 MB · Pratinjau 40 MB · Hasil export 1,5 MB");
  });
});
