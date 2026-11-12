import { describe, expect, it } from "vitest";
import {
  brollItemSchema,
  editingScriptSchema,
  emptyEditingScriptInput,
  saveEditingScriptBodySchema,
} from "./editing-script";

const script = {
  ...emptyEditingScriptInput(),
  removed: [{ removalId: "r1", tokenIds: ["w1", "p1"], kind: "manual" }],
  corrections: { w3: "Halo" },
  transcriptFingerprint: "abc",
};

describe("editingScriptSchema", () => {
  it("menerima script lengkap dan menolak grup potongan kosong", () => {
    expect(editingScriptSchema.parse(script)).toEqual(script);
    const empty = {
      ...script,
      removed: [{ ...script.removed[0], tokenIds: [] }],
    };
    expect(editingScriptSchema.safeParse(empty).success).toBe(false);
  });

  it("body Save: script tanpa fingerprint (diisi server), baseVersion null untuk simpan pertama", () => {
    const { transcriptFingerprint, ...input } = script;
    const body = { baseVersion: null, transcriptFingerprint, script: input };
    expect(saveEditingScriptBodySchema.parse(body)).toEqual(body);
    expect(
      saveEditingScriptBodySchema.safeParse({ ...body, baseVersion: 0 })
        .success,
    ).toBe(false);
  });
});

describe("brollItemSchema", () => {
  const item = {
    startMs: 1_000,
    endMs: 3_000,
    stockVideoId: 7,
    url: "https://cdn.pixabay.com/video/a_large.mp4",
    previewUrl: "https://cdn.pixabay.com/video/a_small.mp4",
    thumbnailUrl: "https://cdn.pixabay.com/video/a_small.jpg",
    pageUrl: "https://pixabay.com/videos/a-7/",
    durationMs: 5_000,
    attribution: "Video oleh Ana di Pixabay",
  };

  it("menolak rentang kosong", () => {
    expect(brollItemSchema.safeParse(item).success).toBe(true);
    expect(
      brollItemSchema.safeParse({ ...item, endMs: item.startMs }).success,
    ).toBe(false);
  });
});
