import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/modules/editor/application";
import { captionPresetSchema, captionStyleSchema } from "@/shared/schemas";
import {
  CAPTION_PRESET_IDS,
  CAPTION_PRESETS,
  clipCaptions,
  presetStyle,
} from "./index";

describe("preset caption", () => {
  it("enam preset, semuanya cocok dengan skema EditingScript", () => {
    expect(CAPTION_PRESET_IDS).toEqual(captionPresetSchema.options);
    for (const id of CAPTION_PRESET_IDS)
      expect(captionStyleSchema.parse(presetStyle(id))).toEqual(
        presetStyle(id),
      );
  });

  it("word-by-word = satu kata per halaman", () => {
    expect(CAPTION_PRESETS["word-by-word"].rules.maxWords).toBe(1);
  });
});

describe("clipCaptions", () => {
  // Klip 0–3000 ms; "eh" (1000–1300) dihapus.
  const tokens = [
    { id: "w1", type: "word" as const, text: "Halo", startMs: 0, endMs: 500 },
    {
      id: "w2",
      type: "word" as const,
      text: "semua,",
      startMs: 500,
      endMs: 1000,
    },
    {
      id: "w3",
      type: "filler" as const,
      text: "eh",
      startMs: 1000,
      endMs: 1300,
    },
    {
      id: "w4",
      type: "word" as const,
      text: "nabung",
      startMs: 1300,
      endMs: 1800,
    },
    {
      id: "w5",
      type: "word" as const,
      text: "yuk.",
      startMs: 1800,
      endMs: 2200,
    },
  ];
  const removedIds = new Set(["w3"]);
  const timeline = buildTimeline(tokens, removedIds, {
    startMs: 0,
    endMs: 3000,
  });

  it("kata terhapus tidak tampil & waktu kata mengikuti potongan", () => {
    const pages = clipCaptions({
      tokens,
      removedIds,
      corrections: {},
      keywords: ["nabung"],
      timeline,
      style: presetStyle("karaoke"),
    });
    const words = pages.flatMap((p) => p.words);
    expect(words.map((w) => w.text)).toEqual([
      "Halo",
      "semua,",
      "nabung",
      "yuk.",
    ]);
    // Potongan berhenti 60 ms sebelum "nabung" (margin ucapan) → maju 240 ms.
    expect(words[2]).toMatchObject({ startMs: 1060, keyword: true });
    expect(pages.at(-1)!.endMs).toBeLessThanOrEqual(timeline.durationMs);
  });

  it("aturan halaman mengikuti preset", () => {
    const style = presetStyle("word-by-word");
    const pages = clipCaptions({
      tokens,
      removedIds,
      corrections: {},
      keywords: [],
      timeline,
      style,
    });
    expect(pages.map((p) => p.words.length)).toEqual([1, 1, 1, 1]);
  });
});
