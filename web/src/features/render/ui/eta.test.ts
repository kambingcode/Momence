import { describe, expect, it } from "vitest";
import { formatEta, renderEtaMs } from "./eta";

describe("renderEtaMs", () => {
  it("menaksir dari laju: 25% dalam 30 dtk → 90 dtk lagi", () => {
    expect(renderEtaMs(0, 25, 30_000)).toBe(90_000);
  });

  it.each([
    ["belum mulai", null, 50, 1000],
    ["progres terlalu kecil", 0, 4, 10_000],
    ["sudah 100%", 0, 100, 10_000],
    ["jam mundur", 5000, 50, 1000],
  ])("null: %s", (_name, startedAt, progress, now) => {
    expect(renderEtaMs(startedAt, progress, now)).toBeNull();
  });
});

describe("formatEta", () => {
  it("menit & detik dibulatkan", () => {
    expect(formatEta(null)).toBeNull();
    expect(formatEta(90_000)).toBe("± 2 mnt");
    expect(formatEta(41_000)).toBe("± 40 dtk");
    expect(formatEta(500)).toBe("± 5 dtk");
  });
});
