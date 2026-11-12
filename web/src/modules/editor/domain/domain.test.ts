import { describe, expect, it } from "vitest";
import {
  type EditorToken,
  tokensFingerprint,
  tokensInRange,
} from "./clip-tokens";
import { tokenEditsProblem } from "./script-rules";

const token = (
  id: string,
  startMs: number,
  endMs: number,
  type: EditorToken["type"] = "word",
): EditorToken => ({ id, type, text: id, startMs, endMs });

const tokens = [
  token("w1", 0, 400),
  token("w2", 400, 900),
  token("p1", 900, 1500, "pause"),
  token("w3", 1500, 2000),
  token("w4", 2000, 2600),
];

describe("tokensInRange", () => {
  it("hanya token yang seluruhnya di dalam rentang", () => {
    expect(
      tokensInRange(tokens, { startMs: 400, endMs: 2000 }).map((t) => t.id),
    ).toEqual(["w2", "p1", "w3"]);
    expect(tokensInRange(tokens, { startMs: 450, endMs: 1900 })).toEqual([
      tokens[2],
    ]);
  });
});

describe("tokensFingerprint", () => {
  it("stabil untuk token yang sama, berubah bila id/waktu/teks bergeser", () => {
    const base = tokensFingerprint(tokens);
    expect(tokensFingerprint([...tokens])).toBe(base);
    expect(base).toMatch(/^5-[0-9a-f]{8}$/);
    const shifted = tokens.map((t) => ({ ...t, startMs: t.startMs + 1 }));
    expect(tokensFingerprint(shifted)).not.toBe(base);
    const renamed = tokens.map((t, i) => ({ ...t, id: `w${i + 2}` }));
    expect(tokensFingerprint(renamed)).not.toBe(base);
    const retyped = tokens.map((t) => ({ ...t, text: t.text.toUpperCase() }));
    expect(tokensFingerprint(retyped)).not.toBe(base);
  });
});

describe("tokenEditsProblem", () => {
  const valid = {
    removed: [
      { removalId: "r1", tokenIds: ["w1", "p1"] },
      { removalId: "r2", tokenIds: ["w4"] },
    ],
    corrections: { w2: "dua", w3: "" },
  };

  it("valid bila semua rujukan ada dan tidak bentrok", () => {
    expect(tokenEditsProblem(valid, tokens)).toBeNull();
    expect(tokenEditsProblem({ removed: [], corrections: {} }, [])).toBeNull();
  });

  it.each([
    [
      "token di luar klip",
      { ...valid, removed: [{ removalId: "r1", tokenIds: ["w9"] }] },
      "Token w9 tidak ada",
    ],
    [
      "token di dua grup",
      {
        ...valid,
        removed: [
          { removalId: "r1", tokenIds: ["w1"] },
          { removalId: "r2", tokenIds: ["w1"] },
        ],
      },
      "lebih dari satu grup",
    ],
    [
      "removalId ganda",
      {
        ...valid,
        removed: [
          { removalId: "r1", tokenIds: ["w1"] },
          { removalId: "r1", tokenIds: ["w2"] },
        ],
      },
      "ganda",
    ],
    ["koreksi jeda", { ...valid, corrections: { p1: "x" } }, "Jeda p1"],
    ["koreksi token asing", { ...valid, corrections: { w9: "x" } }, "w9"],
  ])("menolak %s", (_, edits, message) => {
    expect(tokenEditsProblem(edits, tokens)).toContain(message);
  });
});
