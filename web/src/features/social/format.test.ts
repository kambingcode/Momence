import { describe, expect, it } from "vitest";
import { fullPost, hashtagLine } from "./format";

const copy = { caption: "Nabung itu soal urutan", hashtags: ["#a", "#b"] };

describe("format posting", () => {
  it("hashtag dipisah spasi", () => {
    expect(hashtagLine(copy)).toBe("#a #b");
    expect(hashtagLine({ hashtags: [] })).toBe("");
  });

  it("caption + hashtag di paragraf baru; tanpa hashtag = caption saja", () => {
    expect(fullPost(copy)).toBe("Nabung itu soal urutan\n\n#a #b");
    expect(fullPost({ caption: "Halo", hashtags: [] })).toBe("Halo");
  });

  it("bisa memakai caption lain (varian)", () => {
    expect(fullPost(copy, "Varian")).toBe("Varian\n\n#a #b");
  });
});
