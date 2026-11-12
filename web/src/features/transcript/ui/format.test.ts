import { describe, expect, it } from "vitest";
import { formatPause, formatTimestamp, languageLabel } from "./format";

describe("format transkrip", () => {
  it("label bahasa", () => {
    expect(languageLabel("id")).toBe("Bahasa Indonesia");
    expect(languageLabel("en")).toBe("English");
    expect(languageLabel(null)).toBe("Tanpa ucapan");
  });

  it("durasi jeda", () => {
    expect(formatPause(360)).toBe("0,4 dtk");
    expect(formatPause(8064)).toBe("8,1 dtk");
    expect(formatPause(300)).toBe("0,3 dtk");
  });

  it("penanda waktu dibulatkan ke bawah (tidak melompat ke detik berikutnya)", () => {
    expect(formatTimestamp(7834)).toBe("0:07");
    expect(formatTimestamp(59_999)).toBe("0:59");
    expect(formatTimestamp(3_725_000)).toBe("1:02:05");
  });
});
