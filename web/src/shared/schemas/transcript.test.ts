import { describe, expect, it } from "vitest";
import { transcriptTokenSchema } from "./transcript";

describe("transcriptTokenSchema", () => {
  it("menerima token persis seperti yang ditulis worker", () => {
    // Disalin dari kolom `words` hasil job transcribe sungguhan.
    const fromWorker = {
      id: "w1",
      type: "word",
      text: "Halo",
      startMs: 7460,
      endMs: 8220,
      confidence: 0.899,
    };
    expect(transcriptTokenSchema.parse(fromWorker)).toEqual(fromWorker);
    expect(
      transcriptTokenSchema.parse({ ...fromWorker, confidence: null })
        .confidence,
    ).toBeNull();
  });

  it("menerima token filler & jeda dari worker", () => {
    const filler = {
      id: "w6",
      type: "filler",
      text: "Um,",
      startMs: 2210,
      endMs: 2560,
      confidence: 0.61,
    };
    const pause = {
      id: "p1",
      type: "pause",
      text: "",
      startMs: 0,
      endMs: 8064,
      confidence: null,
    };
    expect(transcriptTokenSchema.parse(filler)).toEqual(filler);
    expect(transcriptTokenSchema.parse(pause)).toEqual(pause);
  });

  it("menolak tipe token yang tidak dikenal", () => {
    expect(
      transcriptTokenSchema.safeParse({
        id: "w1",
        type: "music",
        text: "",
        startMs: 0,
        endMs: 1,
        confidence: null,
      }).success,
    ).toBe(false);
  });
});
