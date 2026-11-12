import { describe, expect, it } from "vitest";
import type { Clip } from "@/modules/clips/application";
import type { Transcript } from "@/modules/transcript/application";
import {
  emptyEditingScriptInput,
  type SaveEditingScriptBody,
} from "@/shared/schemas/editing-script";
import type { CropTracks } from "@/shared/schemas/reframe";
import type { TranscriptToken } from "@/shared/schemas/transcript";
import { tokensFingerprint } from "../domain/clip-tokens";
import { GetClipEditor } from "./get-clip-editor";
import { InMemoryEditingScriptRepository } from "./in-memory-editing-script-repository";
import { SaveEditingScript } from "./save-editing-script";

const token = (
  id: string,
  startMs: number,
  endMs: number,
  type: TranscriptToken["type"] = "word",
): TranscriptToken => ({
  id,
  type,
  text: id,
  startMs,
  endMs,
  confidence: null,
});

// Klip 1000–3000 berisi w2, p1, w3; w1 & w4 di luarnya.
const transcriptTokens = [
  token("w1", 0, 900),
  token("w2", 1000, 1500),
  token("p1", 1500, 2200, "pause"),
  token("w3", 2200, 3000),
  token("w4", 3000, 3500),
];
const clipTokens = transcriptTokens.slice(1, 4);
const fingerprint = tokensFingerprint(clipTokens);

const clip = {
  id: "c1",
  projectId: "p1",
  title: "Klip",
  startMs: 1000,
  endMs: 3000,
} as Clip;

const cropTracks: CropTracks = { "9:16": [], "1:1": [], "16:9": [] };

function setup(tokens = transcriptTokens) {
  const clips = { get: async (id: string) => (id === clip.id ? clip : null) };
  const transcripts = {
    findByProject: async (projectId: string) =>
      projectId === "p1" ? ({ tokens } as Transcript) : null,
  };
  const scripts = new InMemoryEditingScriptRepository();
  return {
    scripts,
    get: new GetClipEditor(clips, transcripts, scripts, {
      execute: async ({ id }) => (id === "c1" ? cropTracks : null),
    }),
    save: new SaveEditingScript(clips, transcripts, scripts),
  };
}

const body = (
  overrides: Partial<SaveEditingScriptBody> = {},
): SaveEditingScriptBody => ({
  baseVersion: null,
  transcriptFingerprint: fingerprint,
  script: {
    ...emptyEditingScriptInput(),
    removed: [{ removalId: "r1", tokenIds: ["p1"], kind: "manual" }],
    corrections: { w3: "tiga" },
  },
  ...overrides,
});

describe("GetClipEditor", () => {
  it("klip + token di rentangnya, tanpa EditingScript", async () => {
    expect(await setup().get.execute("c1")).toEqual({
      clip,
      tokens: clipTokens,
      transcriptFingerprint: fingerprint,
      editingScript: null,
      stale: false,
      cropTracks,
    });
    expect(await setup().get.execute("hilang")).toBeNull();
  });

  it("Save → buka lagi menampilkan state yang sama", async () => {
    const { get, save } = setup();
    const saved = await save.execute("c1", body());
    expect(saved).toMatchObject({
      status: "saved",
      editingScript: { clipId: "c1", version: 1 },
    });
    const opened = await get.execute("c1");
    expect(opened?.editingScript?.script).toEqual({
      ...body().script,
      transcriptFingerprint: fingerprint,
    });
    expect(opened?.stale).toBe(false);
  });

  it("teks custom ikut tersimpan & dimuat lagi apa adanya", async () => {
    const { get, save } = setup();
    const textOverlays = [
      {
        id: "t1",
        text: "Não é só isso, né?",
        startMs: 1_200,
        endMs: 2_800,
        x: 50,
        y: 80,
        fontSize: 6,
        color: "#ffffff",
        font: "montserrat" as const,
      },
    ];
    const withText = body({
      script: { ...body().script, textOverlays },
    });
    expect((await save.execute("c1", withText)).status).toBe("saved");
    const opened = await get.execute("c1");
    expect(opened?.editingScript?.script.textOverlays).toEqual(textOverlays);
  });

  it("stale bila transkrip berubah setelah disimpan (transkripsi ulang)", async () => {
    const first = setup();
    await first.save.execute("c1", body());
    const shifted = transcriptTokens.map((t) => ({ ...t, id: `${t.id}x` }));
    const reopened = new GetClipEditor(
      { get: async () => clip },
      { findByProject: async () => ({ tokens: shifted }) as Transcript },
      first.scripts,
      { execute: async () => null },
    );
    expect(await reopened.execute("c1")).toMatchObject({ stale: true });
  });
});

describe("SaveEditingScript", () => {
  it("versi naik tiap Save; baseVersion lama → conflict dengan versi terkini", async () => {
    const { save } = setup();
    await save.execute("c1", body());
    const second = await save.execute("c1", body({ baseVersion: 1 }));
    expect(second).toMatchObject({ editingScript: { version: 2 } });

    const stale = await save.execute("c1", body({ baseVersion: 1 }));
    expect(stale).toMatchObject({
      status: "conflict",
      current: { version: 2 },
    });
    expect(await save.execute("c1", body())).toMatchObject({
      status: "conflict",
    });
  });

  it("menolak rujukan token yang tidak valid tanpa menyimpan", async () => {
    const { save, scripts } = setup();
    const invalid = body({
      script: {
        ...emptyEditingScriptInput(),
        removed: [{ removalId: "r1", tokenIds: ["w1"], kind: "manual" }],
      },
    });
    expect(await save.execute("c1", invalid)).toEqual({
      status: "invalid",
      message: "Token w1 tidak ada di klip ini.",
    });
    expect(scripts.rows.size).toBe(0);
  });

  it("menolak bila transkrip berubah sejak editor dibuka", async () => {
    const { save, scripts } = setup();
    expect(
      await save.execute("c1", body({ transcriptFingerprint: "lama" })),
    ).toEqual({ status: "stale" });
    expect(scripts.rows.size).toBe(0);
  });

  it("not_found untuk klip yang tidak ada", async () => {
    expect(await setup().save.execute("hilang", body())).toEqual({
      status: "not_found",
    });
  });
});
