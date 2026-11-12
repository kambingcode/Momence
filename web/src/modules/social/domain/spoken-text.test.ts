import { describe, expect, it } from "vitest";
import { MAX_SPOKEN_CHARS, spokenText } from "./spoken-text";

const word = (text: string) => ({ type: "word" as const, text });

describe("spokenText", () => {
  it("menyambung kata; filler dan jeda dibuang", () => {
    expect(
      spokenText([
        word("Halo"),
        { type: "pause", text: "" },
        { type: "filler", text: "eh" },
        word("semua."),
        word("  "),
        word(" Ini "),
      ]),
    ).toBe("Halo semua. Ini");
  });

  it("kosong bila tidak ada kata", () => {
    expect(spokenText([])).toBe("");
    expect(spokenText([{ type: "pause", text: "" }])).toBe("");
  });

  it("dipotong di batas kata saat melebihi batas", () => {
    const chunk = "a".repeat(999);
    const tokens = Array.from({ length: 20 }, () => word(chunk));
    const text = spokenText(tokens);
    expect(text.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS);
    expect(text.split(" ").every((w) => w === chunk)).toBe(true);
    expect(text.split(" ")).toHaveLength(12);
  });
});
