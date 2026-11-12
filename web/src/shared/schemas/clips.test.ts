import { describe, expect, it } from "vitest";
import { clipDetailsSchema } from "./clips";
import { discoverPayloadSchema, reframePayloadSchema } from "./jobs";

// Disalin dari bentuk `details_to_json` di worker (tes integrasi test_sqlalchemy_clips.py).
const fromWorker = {
  sourceId: "s1",
  rawScore: 6.5,
  hook: "Hook",
  startTokenId: "w1",
  endTokenId: "w9",
  keywords: ["nabung", "darurat"],
  subscores: {
    hook: { score: 8, comment: "a" },
    flow: { score: 7, comment: "b" },
    value: { score: 6, comment: "c" },
    trend: { score: 0, comment: "d" },
  },
};

describe("clipDetailsSchema", () => {
  it("menerima details persis seperti yang ditulis worker", () => {
    expect(clipDetailsSchema.parse(fromWorker)).toEqual(fromWorker);
  });

  it("klip sebelum kata kunci ada (T6.2) → keywords kosong", () => {
    const old: Partial<typeof fromWorker> = { ...fromWorker };
    delete old.keywords;
    expect(clipDetailsSchema.parse(old).keywords).toEqual([]);
  });

  it("menolak subskor di luar 0–10 atau komponen yang hilang", () => {
    const outOfRange = {
      ...fromWorker,
      subscores: { ...fromWorker.subscores, hook: { score: 11, comment: "" } },
    };
    expect(clipDetailsSchema.safeParse(outOfRange).success).toBe(false);
    const missing = { ...fromWorker.subscores, trend: undefined };
    expect(
      clipDetailsSchema.safeParse({ ...fromWorker, subscores: missing })
        .success,
    ).toBe(false);
  });
});

describe("discoverPayloadSchema", () => {
  it("cocok dengan payload yang diantre worker setelah transcribe", () => {
    expect(discoverPayloadSchema.parse({ sourceId: "s1" })).toEqual({
      sourceId: "s1",
    });
    expect(discoverPayloadSchema.safeParse({ sourceId: "" }).success).toBe(
      false,
    );
  });
});

describe("reframePayloadSchema", () => {
  it("cocok dengan payload yang diantre worker setelah discover", () => {
    expect(reframePayloadSchema.parse({ clipIds: ["c1", "c2"] })).toEqual({
      clipIds: ["c1", "c2"],
    });
    expect(reframePayloadSchema.safeParse({ clipIds: [] }).success).toBe(false);
    expect(reframePayloadSchema.safeParse({ clipIds: [""] }).success).toBe(
      false,
    );
  });
});
