import { describe, expect, it } from "vitest";
import type { CleanupToken } from "./cleanup";
import {
  DEFAULT_FILLER_CONFIG,
  detectFillers,
  fillerKey,
  REPEAT_MAX_GAP_MS,
} from "./fillers";

/** Kata berurutan 200 ms tanpa celah; `null` = jeda 500 ms. */
function tokensOf(...texts: (string | null)[]): CleanupToken[] {
  let words = 0;
  let pauses = 0;
  return texts.map((text, i) =>
    text === null
      ? {
          id: `p${(pauses += 1)}`,
          type: "pause",
          text: "",
          startMs: i * 200,
          endMs: i * 200 + 200,
        }
      : {
          id: `w${(words += 1)}`,
          type: "word",
          text,
          startMs: i * 200,
          endMs: i * 200 + 200,
        },
  );
}

const summary = (tokens: readonly CleanupToken[]) =>
  detectFillers(tokens).map((m) => [m.kind, m.key, m.tokenIds]);

describe("fillerKey", () => {
  it.each([
    ["Ummm,", "um"],
    ["hmmm...", "hm"],
    ["Eeh,", "eh"],
    ["M,", "m"],
    ["Mm-hmm", "mhm"],
    ["anu,", "anu"],
    ["sehari-hari", "seharihari"],
  ])("%s → %s (sama dengan worker)", (text, key) => {
    expect(fillerKey(text)).toBe(key);
  });
});

describe("detectFillers", () => {
  it("menemukan filler & frasa bahasa Indonesia", () => {
    const tokens = tokensOf(
      "Jadi,",
      "eh,",
      "saya",
      "emang",
      "mau",
      "anu,",
      "apa",
      "namanya,",
      "menabung.",
    );
    expect(summary(tokens)).toEqual([
      ["filler", "eh", ["w2"]],
      ["filler", "anu", ["w6"]],
      ["phrase", "apa namanya", ["w7", "w8"]],
    ]);
  });

  it("menemukan filler & frasa bahasa Inggris", () => {
    const tokens = tokensOf(
      "Umm,",
      "I",
      "mean,",
      "it's",
      "kind",
      "of",
      "great,",
      "you",
      "know?",
      "Mm-hmm.",
    );
    expect(summary(tokens)).toEqual([
      ["filler", "um", ["w1"]],
      ["phrase", "i mean", ["w2", "w3"]],
      ["phrase", "kind of", ["w5", "w6"]],
      ["phrase", "you know", ["w8", "w9"]],
      ["filler", "mhm", ["w10"]],
    ]);
  });

  it("memakai daftar, bukan tipe dari worker; daftar boleh ditulis bebas", () => {
    const tokens: CleanupToken[] = [
      { id: "w1", type: "filler", text: "eh", startMs: 0, endMs: 100 },
      { id: "w2", type: "word", text: "Gitu,", startMs: 100, endMs: 300 },
    ];
    expect(
      detectFillers(tokens, { words: ["GITUUU"], phrases: [] }).map(
        (m) => m.tokenIds,
      ),
    ).toEqual([["w2"]]);
  });

  it("akhir kalimat memutus frasa, tetapi boleh di kata terakhirnya", () => {
    expect(summary(tokensOf("That's", "kind.", "Of", "course"))).toEqual([]);
    expect(summary(tokensOf("Ya,", "apa", "ya?"))).toEqual([
      ["phrase", "apa ya", ["w2", "w3"]],
    ]);
  });

  it("frasa terpanjang menang, jeda memutus frasa", () => {
    const config = { words: ["apa"], phrases: ["apa namanya"] };
    expect(
      detectFillers(tokensOf("apa", "namanya"), config).map((m) => m.key),
    ).toEqual(["apa namanya"]);
    expect(
      detectFillers(tokensOf("you", null, "know"), DEFAULT_FILLER_CONFIG),
    ).toEqual([]);
  });

  it("kata berulang: yang terakhir dipertahankan, filler & jeda boleh di antaranya", () => {
    expect(summary(tokensOf("Saya", "saya", "saya", "mau", "makan."))).toEqual([
      ["repeated", "saya", ["w1", "w2"]],
    ]);
    expect(summary(tokensOf("the,", "uh,", null, "the", "plan"))).toEqual([
      ["repeated", "the", ["w1"]],
      ["filler", "uh", ["w2"]],
    ]);
  });

  it("bukan pengulangan: kata lain, akhir kalimat, celah panjang, filler ganda", () => {
    expect(summary(tokensOf("to", "too"))).toEqual([]);
    expect(summary(tokensOf("Oke.", "Oke,", "lanjut"))).toEqual([]);
    expect(summary(tokensOf("saya", "mau", "saya"))).toEqual([]);
    const gap: CleanupToken[] = [
      { id: "w1", type: "word", text: "ya", startMs: 0, endMs: 200 },
      {
        id: "w2",
        type: "word",
        text: "ya",
        startMs: 200 + REPEAT_MAX_GAP_MS + 1,
        endMs: 2000,
      },
    ];
    expect(summary(gap)).toEqual([]);
    expect(summary(tokensOf("eh", "eh"))).toEqual([
      ["filler", "eh", ["w1"]],
      ["filler", "eh", ["w2"]],
    ]);
  });

  it("rentang temuan dari awal token pertama sampai akhir token terakhir", () => {
    const [match] = detectFillers(tokensOf("ok", "you", "know"));
    expect(match).toMatchObject({ startMs: 200, endMs: 600 });
  });
});
