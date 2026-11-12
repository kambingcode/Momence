import { describe, expect, it } from "vitest";
import { parseByteRange } from "./byte-range";

describe("parseByteRange", () => {
  it.each([
    ["bytes=0-99", { start: 0, end: 99 }],
    ["bytes=100-", { start: 100, end: 999 }],
    ["bytes=-100", { start: 900, end: 999 }],
    // Akhir melewati file dijepit (perilaku browser saat seek).
    ["bytes=900-5000", { start: 900, end: 999 }],
    ["bytes=-5000", { start: 0, end: 999 }],
    [" bytes=0-0 ", { start: 0, end: 0 }],
  ])("%s", (header, expected) => {
    expect(parseByteRange(header, 1000)).toEqual(expected);
  });

  it.each([null, undefined, "", "bytes=-", "items=0-10", "bytes=0-1,5-9"])(
    "tanpa rentang yang didukung (%s) → seluruh file",
    (header) => {
      expect(parseByteRange(header, 1000)).toBeNull();
    },
  );

  it.each(["bytes=1000-", "bytes=5-2", "bytes=-0"])(
    "%s → unsatisfiable",
    (header) => {
      expect(parseByteRange(header, 1000)).toBe("unsatisfiable");
    },
  );

  it("file kosong tidak punya rentang yang valid", () => {
    expect(parseByteRange("bytes=0-", 0)).toBe("unsatisfiable");
  });
});
