import { describe, expect, it } from "vitest";
import type { EditorToken } from "./clip-tokens";
import {
  correctionsForAll,
  matchingWords,
  splitPunctuation,
  wordKey,
} from "./corrections";

const token = (
  id: string,
  text: string,
  type: EditorToken["type"] = "word",
): EditorToken => ({ id, type, text, startMs: 0, endMs: 0 });

const tokens = [
  token("w1", "Menabung"),
  token("w2", "itu"),
  token("p1", "", "pause"),
  token("w3", "menabung,"),
  token("w4", "“menabung.”"),
  token("w5", "menabungnya"),
  token("w6", "eh", "filler"),
];

describe("tanda baca & pencocokan", () => {
  it("memisahkan tanda baca di tepi kata", () => {
    expect(splitPunctuation("“Halo,”")).toEqual({
      lead: "“",
      core: "Halo",
      trail: ",”",
    });
    expect(splitPunctuation("di-ulang")).toEqual({
      lead: "",
      core: "di-ulang",
      trail: "",
    });
    expect(splitPunctuation("...")).toEqual({
      lead: "...",
      core: "",
      trail: "",
    });
    expect(wordKey(" Menabung, ")).toBe("menabung");
  });

  it("kata yang sama tanpa melihat huruf besar & tanda baca; jeda tidak pernah cocok", () => {
    expect(matchingWords(tokens, 3)).toEqual([0, 3, 4]);
    expect(matchingWords(tokens, 5)).toEqual([5]);
    expect(matchingWords(tokens, 2)).toEqual([]);
    expect(matchingWords(tokens, 6)).toEqual([6]);
  });
});

describe("correctionsForAll", () => {
  it("memakai tanda baca milik tiap kata bila pengguna tidak menulisnya", () => {
    expect(correctionsForAll(tokens, 0, "Nabung")).toEqual({
      w1: "Nabung",
      w3: "Nabung,",
      w4: "“Nabung.”",
    });
  });

  it("tanda baca yang ditulis pengguna menang", () => {
    expect(correctionsForAll(tokens, 0, "Nabung!")).toEqual({
      w1: "Nabung!",
      w3: "Nabung!",
      w4: "“Nabung!",
    });
  });

  it("teks kosong menghapus koreksi semua kata itu", () => {
    expect(correctionsForAll(tokens, 3, "  ")).toEqual({
      w1: null,
      w3: null,
      w4: null,
    });
  });
});
