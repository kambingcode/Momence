import { describe, expect, it } from "vitest";
import {
  type CaptionWord,
  captionPages,
  captionWords,
  keywordKey,
  PAGE_LINGER_MS,
} from "./pages";

const word = (
  text: string,
  startMs: number,
  endMs = startMs + 200,
  keyword = false,
): CaptionWord => ({ text, startMs, endMs, keyword });

describe("captionWords", () => {
  it("kata yang dipertahankan dengan koreksi, waktu klip, dan kata kunci", () => {
    const words = captionWords({
      tokens: [
        { id: "w1", type: "word", text: "Jadi,", startMs: 1000, endMs: 1200 },
        { id: "w2", type: "filler", text: "eh,", startMs: 1200, endMs: 1400 },
        { id: "p1", type: "pause", text: "", startMs: 1400, endMs: 2000 },
        {
          id: "w3",
          type: "word",
          text: "“Nabung”",
          startMs: 2000,
          endMs: 2400,
        },
        {
          id: "w4",
          type: "word",
          text: "sekarang.",
          startMs: 2400,
          endMs: 2900,
        },
      ],
      removedIds: new Set(["w2"]),
      corrections: { w3: "Menabung" },
      keywords: ["nabung"],
      toClipMs: (ms) => ms - 1000,
    });
    expect(words).toEqual([
      word("Jadi,", 0, 200),
      word("Menabung", 1000, 1400, true),
      word("sekarang.", 1400, 1900),
    ]);
  });

  it("keywordKey sama dengan kunci worker", () => {
    expect(keywordKey("“Nabung,”")).toBe("nabung");
    expect(keywordKey("di-ulang")).toBe("di-ulang");
  });
});

describe("captionPages", () => {
  const rules = { maxWords: 3, maxChars: 16 };

  it("memecah di batas kata, karakter, akhir kalimat, dan jeda (ID)", () => {
    const words = [
      word("Kalau", 0),
      word("kamu", 200),
      word("mau", 400),
      word("menabung", 600), // batas 3 kata
      word("setiap", 800),
      word("bulan.", 1000), // akhir kalimat
      word("Mulai", 1200),
      word("hari", 2000), // jeda tepat 600 ms → belum memutus (harus > 600)
      word("ini", 2900), // jeda 700 > 600 → halaman baru
    ];
    expect(
      captionPages(words, rules, 10_000).map((p) =>
        p.words.map((w) => w.text).join(" "),
      ),
    ).toEqual([
      "Kalau kamu mau",
      "menabung setiap",
      "bulan.",
      "Mulai hari",
      "ini",
    ]);
  });

  it("memecah di batas karakter (EN), kata panjang tetap satu halaman", () => {
    const words = [
      word("Consistency", 0),
      word("beats", 200),
      word("intensity", 400),
      word("extraordinarily", 600),
    ];
    expect(
      captionPages(words, { maxWords: 10, maxChars: 16 }, 10_000).map((p) =>
        p.words.map((w) => w.text).join(" "),
      ),
    ).toEqual(["Consistency", "beats intensity", "extraordinarily"]);
  });

  it("halaman tampil sampai halaman berikutnya, atau kata terakhir + linger", () => {
    const pages = captionPages(
      [
        word("Satu.", 0, 300),
        word("Dua.", 400, 700),
        word("Tiga.", 5000, 5300),
      ],
      rules,
      5400,
    );
    expect(pages.map((p) => [p.startMs, p.endMs])).toEqual([
      [0, 400],
      [400, 700 + PAGE_LINGER_MS],
      [5000, 5400], // dijepit ke durasi klip
    ]);
  });

  it("tanpa kata → tanpa halaman", () => {
    expect(captionPages([], rules, 1000)).toEqual([]);
  });
});
