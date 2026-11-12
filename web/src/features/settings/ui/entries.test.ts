import { describe, expect, it } from "vitest";
import { formatEntries, parseEntries } from "./entries";

describe("parseEntries", () => {
  it("memisah per baris atau koma dan membuang entri kosong", () => {
    expect(parseEntries(" eh, em\n\napa ya \n,anu,")).toEqual([
      "eh",
      "em",
      "apa ya",
      "anu",
    ]);
  });

  it("kembali utuh setelah formatEntries", () => {
    const entries = ["eh", "apa namanya"];
    expect(parseEntries(formatEntries(entries))).toEqual(entries);
  });
});
