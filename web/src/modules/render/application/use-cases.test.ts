import { describe, expect, it } from "vitest";
import { presetStyle } from "@/modules/captions/application";
import type { Clip } from "@/modules/clips/application";
import type { ClipEditorData } from "@/modules/editor/application";
import type { Job, NewJob } from "@/modules/jobs/application";
import type { ProjectWithSource } from "@/modules/projects/application";
import type { ReframeStatus } from "@/modules/reframe/application";
import { type CropTracks, renderPayloadSchema } from "@/shared/schemas";
import { OpenRenderOutput } from "./open-render-output";
import { StartClipRender } from "./start-clip-render";

const clip = {
  id: "c1",
  projectId: "p1",
  title: "Rahasia nabung",
  startMs: 0,
  endMs: 3000,
  details: { keywords: ["nabung"] },
} as unknown as Clip;

const tokens = [
  {
    id: "w1",
    type: "word",
    text: "Halo",
    startMs: 0,
    endMs: 500,
    confidence: null,
  },
  {
    id: "w2",
    type: "filler",
    text: "eh",
    startMs: 500,
    endMs: 1000,
    confidence: null,
  },
  {
    id: "w3",
    type: "word",
    text: "nabung.",
    startMs: 1000,
    endMs: 3000,
    confidence: null,
  },
] as ClipEditorData["tokens"];

function editorData(overrides: Partial<ClipEditorData> = {}): ClipEditorData {
  return {
    clip,
    tokens,
    transcriptFingerprint: "f1",
    editingScript: {
      version: 2,
      updatedAt: 1,
      script: {
        removed: [{ removalId: "r1", tokenIds: ["w2"], kind: "filler" }],
        corrections: { w3: "menabung." },
        reframe: { layout: "fit", tracker: true, aspectRatio: "9:16" },
        caption: presetStyle("pop"),
        broll: [],
        transcriptFingerprint: "f1",
      },
    },
    stale: false,
    cropTracks: null,
    ...overrides,
  } as ClipEditorData;
}

const cropTracks: CropTracks = {
  "9:16": [
    { tMs: 0, cropRect: { x: 0.1, y: 0, width: 0.3164, height: 1 } },
    { tMs: 2_000, cropRect: { x: 0.4, y: 0, width: 0.3164, height: 1 } },
  ],
  "1:1": [{ tMs: 0, cropRect: { x: 0.2, y: 0, width: 0.5625, height: 1 } }],
  "16:9": [],
};

const project = {
  id: "p1",
  source: { path: "media/p1/source.mov", proxyPath: "media/p1/proxy.mp4" },
} as ProjectWithSource;

function setup(
  data: ClipEditorData | null,
  source = project,
  reframeStatus: ReframeStatus = "missing",
) {
  const queued: NewJob[] = [];
  const start = new StartClipRender(
    { execute: async () => data },
    { get: async () => source },
    {
      execute: async (job) => {
        queued.push(job);
        return { id: "j1", ...job } as unknown as Job;
      },
    },
    { execute: async () => ({ status: reframeStatus }) },
  );
  return { start, queued };
}

describe("StartClipRender", () => {
  it("mengantre render dari EditingScript tersimpan", async () => {
    const { start, queued } = setup(editorData());
    const result = await start.execute("c1");
    expect(result.status).toBe("started");
    const [job] = queued;
    expect(job).toMatchObject({ projectId: "p1", type: "render" });
    const payload = renderPayloadSchema.parse(job!.payload);
    expect(payload).toMatchObject({
      clipId: "c1",
      sourcePath: "media/p1/source.mov",
    });
    const props = payload.props as {
      plan: { durationInFrames: number };
      layout: string;
      captions: {
        style: { preset: string };
        pages: { words: { text: string; keyword: boolean }[] }[];
      };
    };
    // "eh" (500 ms) dipotong: 3000 − (500 − 60 ms margin) = 2560 ms ≈ 77 frame.
    expect(props.plan.durationInFrames).toBe(77);
    expect(props.layout).toBe("fit");
    expect(props.captions.style.preset).toBe("pop");
    const words = props.captions.pages.flatMap((p) => p.words);
    expect(words.map((w) => [w.text, w.keyword])).toEqual([
      ["Halo", false],
      ["menabung.", true],
    ]);
  });

  it("tanpa EditingScript → klip utuh, caption & layout bawaan, crop tengah", async () => {
    const { start, queued } = setup(editorData({ editingScript: null }));
    expect((await start.execute("c1")).status).toBe("started");
    const props = renderPayloadSchema.parse(queued[0]!.payload).props as {
      plan: { durationInFrames: number };
      layout: string;
      crop: unknown[];
      captions: { style: { preset: string } };
    };
    expect(props.plan.durationInFrames).toBe(90);
    expect(props.layout).toBe("fill");
    expect(props.crop).toEqual([]);
    expect(props.captions.style.preset).toBe("karaoke");
  });

  it("memakai jalur crop auto-reframe 9:16 hasil analisis", async () => {
    const { start, queued } = setup(
      editorData({ editingScript: null, cropTracks }),
    );
    await start.execute("c1");
    const props = renderPayloadSchema.parse(queued[0]!.payload).props as {
      crop: unknown[];
    };
    expect(props.crop).toEqual(cropTracks["9:16"]);
  });

  const withReframe = (
    reframe: NonNullable<ClipEditorData["editingScript"]>["script"]["reframe"],
    overrides: Partial<ClipEditorData> = {},
  ) => {
    const data = editorData({ cropTracks, ...overrides });
    data.editingScript!.script.reframe = reframe;
    return data;
  };
  const renderProps = (queued: NewJob[]) =>
    renderPayloadSchema.parse(queued[0]!.payload).props as {
      aspectRatio: string;
      layout: string;
      crop: unknown[];
    };

  it("rasio terpilih menentukan ukuran & jalur crop; Tracker mati / Fit → tanpa jalur", async () => {
    const square = setup(
      withReframe({ layout: "fill", tracker: true, aspectRatio: "1:1" }),
    );
    await square.start.execute("c1");
    expect(renderProps(square.queued)).toMatchObject({
      aspectRatio: "1:1",
      layout: "fill",
      crop: cropTracks["1:1"],
    });

    const noTracker = setup(
      withReframe({ layout: "fill", tracker: false, aspectRatio: "9:16" }),
    );
    await noTracker.start.execute("c1");
    expect(renderProps(noTracker.queued).crop).toEqual([]);

    const fit = setup(
      withReframe({ layout: "fit", tracker: true, aspectRatio: "16:9" }),
    );
    await fit.start.execute("c1");
    expect(renderProps(fit.queued)).toMatchObject({
      aspectRatio: "16:9",
      layout: "fit",
      crop: [],
    });
  });

  it("B-roll tersimpan ikut ke props; yang jatuh di bagian terpotong tidak tampil", async () => {
    const item = (startMs: number, endMs: number, name: string) => ({
      startMs,
      endMs,
      stockVideoId: 1,
      url: `https://cdn.pixabay.com/video/${name}_large.mp4`,
      previewUrl: `https://cdn.pixabay.com/video/${name}_small.mp4`,
      thumbnailUrl: "https://cdn.pixabay.com/video/t.jpg",
      pageUrl: "https://pixabay.com/videos/v-1/",
      durationMs: 10_000,
      attribution: "Video oleh Ana di Pixabay",
    });
    const data = editorData();
    // "eh" (500–1000 ms) dipotong; B-roll kedua jatuh tepat di dalamnya.
    data.editingScript!.script.broll = [
      item(1_200, 2_200, "a"),
      item(600, 900, "hilang"),
    ];
    const { start, queued } = setup(data);
    await start.execute("c1");
    const props = renderPayloadSchema.parse(queued[0]!.payload).props as {
      broll: { url: string; durationInFrames: number }[];
    };
    expect(props.broll).toMatchObject([
      {
        url: "https://cdn.pixabay.com/video/a_large.mp4",
        durationInFrames: 30,
      },
    ]);
  });

  it("teks custom tersimpan ikut ke props (tanpa waktu sumber); EditingScript lama → tanpa teks", async () => {
    const style = {
      x: 50,
      y: 20,
      fontSize: 8,
      color: "#ffcc00",
      font: "bangers" as const,
    };
    const data = editorData();
    // "eh" (500–1000 ms) dipotong: teks kedua seluruhnya di dalamnya.
    data.editingScript!.script.textOverlays = [
      { id: "t1", text: "Judul", startMs: 1_200, endMs: 2_200, ...style },
      { id: "t2", text: "Hilang", startMs: 600, endMs: 900, ...style },
    ];
    const { start, queued } = setup(data);
    await start.execute("c1");
    const props = renderPayloadSchema.parse(queued[0]!.payload).props as {
      textOverlays: unknown[];
    };
    expect(props.textOverlays).toEqual([
      {
        fromFrame: 23,
        durationInFrames: 30,
        overlay: { id: "t1", text: "Judul", ...style },
      },
    ]);

    // `editorData()` meniru EditingScript tanpa field `textOverlays`.
    const old = setup(editorData());
    await old.start.execute("c1");
    expect(
      (
        renderPayloadSchema.parse(old.queued[0]!.payload).props as {
          textOverlays: unknown[];
        }
      ).textOverlays,
    ).toEqual([]);
  });

  it("Tracker aktif saat analisis wajah masih berjalan → ditolak; belum/gagal dianalisis → crop tengah", async () => {
    const tracker = {
      layout: "fill",
      tracker: true,
      aspectRatio: "9:16",
    } as const;
    const pending = setup(
      withReframe(tracker, { cropTracks: null }),
      project,
      "pending",
    );
    expect(await pending.start.execute("c1")).toMatchObject({
      status: "invalid",
    });
    expect(pending.queued).toEqual([]);

    const missing = setup(withReframe(tracker, { cropTracks: null }));
    expect((await missing.start.execute("c1")).status).toBe("started");
    expect(renderProps(missing.queued).crop).toEqual([]);

    // Tracker mati tidak menunggu analisis.
    const off = setup(
      withReframe({ ...tracker, tracker: false }, { cropTracks: null }),
      project,
      "pending",
    );
    expect((await off.start.execute("c1")).status).toBe("started");
  });

  it("menolak: klip tidak ada, editan usang, sumber hilang, semua terhapus", async () => {
    expect(await setup(null).start.execute("x")).toEqual({
      status: "not_found",
    });
    expect(
      (await setup(editorData({ stale: true })).start.execute("c1")).status,
    ).toBe("invalid");
    expect(
      (
        await setup(editorData(), { ...project, source: null }).start.execute(
          "c1",
        )
      ).status,
    ).toBe("invalid");
    const notReady = setup(editorData(), {
      ...project,
      source: { ...project.source!, proxyPath: null },
    });
    expect(await notReady.start.execute("c1")).toMatchObject({
      status: "invalid",
      message: expect.stringContaining("masih diunduh"),
    });
    expect(notReady.queued).toEqual([]);
    const allRemoved = editorData();
    allRemoved.editingScript!.script.removed = [
      { removalId: "r1", tokenIds: ["w1", "w2", "w3"], kind: "manual" },
    ];
    const { start, queued } = setup(allRemoved);
    expect(await start.execute("c1")).toMatchObject({ status: "invalid" });
    expect(queued).toEqual([]);
  });
});

describe("OpenRenderOutput", () => {
  const doneJob = {
    id: "j1",
    type: "render",
    status: "done",
    result: {
      clipId: "c1",
      outputPath: "media/p1/renders/j1.mp4",
      sizeBytes: 3,
    },
  } as Job;

  function open(job: Job | null, size: number | null = 3) {
    const reads: unknown[] = [];
    const output = new OpenRenderOutput(
      { execute: async () => job },
      { get: async () => clip },
      {
        fileSize: async () => size,
        readFile: (path, range) => {
          reads.push([path, range]);
          return new ReadableStream();
        },
      },
    );
    return { output, reads };
  }

  it("stream seluruh file hasil + judul klip", async () => {
    const { output, reads } = open(doneJob);
    expect(await output.execute("j1")).toMatchObject({
      status: "ok",
      size: 3,
      title: "Rahasia nabung",
    });
    expect(reads).toEqual([["media/p1/renders/j1.mp4", { start: 0, end: 2 }]]);
  });

  it("belum selesai / bukan render / file hilang", async () => {
    expect(
      (await open({ ...doneJob, status: "running" }).output.execute("j1"))
        .status,
    ).toBe("not_ready");
    expect(
      (await open({ ...doneJob, type: "discover" }).output.execute("j1"))
        .status,
    ).toBe("not_found");
    expect((await open(null).output.execute("j1")).status).toBe("not_found");
    expect((await open(doneJob, null).output.execute("j1")).status).toBe(
      "not_found",
    );
    expect(
      (
        await open({ ...doneJob, result: { clipId: "c1" } }).output.execute(
          "j1",
        )
      ).status,
    ).toBe("not_found");
  });
});
