import { describe, expect, it } from "vitest";
import { presetStyle } from "@/modules/captions/application";
import { defaultReframe, MAX_TEXT_OVERLAYS } from "@/shared/schemas";
import {
  CAPTION_MERGE_MS,
  createEditorStore,
  docKey,
  docOf,
  type EditorDoc,
  NEW_TEXT_STYLE,
} from "./editor-store";

const EMPTY: EditorDoc = {
  removed: [],
  corrections: {},
  caption: null,
  reframe: defaultReframe(),
  broll: [],
  textOverlays: [],
};

const ids = () => {
  let n = 0;
  return () => `r${(n += 1)}`;
};

describe("editor store", () => {
  it("memotong token sebagai grup lalu memulihkan grup utuh", () => {
    const store = createEditorStore(EMPTY, ids());
    store.getState().removeTokens(["w1", "w2"]);
    store.getState().removeTokens(["w2", "w3"]);
    expect(store.getState().removed).toEqual([
      { removalId: "r1", tokenIds: ["w1", "w2"], kind: "manual" },
      { removalId: "r2", tokenIds: ["w3"], kind: "manual" },
    ]);
    // Menyentuh satu token (w2) memulihkan seluruh grupnya (w1 ikut).
    store.getState().restoreTokens(["w2"]);
    expect(store.getState().removed.map((r) => r.removalId)).toEqual(["r2"]);
  });

  it("memotong beberapa grup sekaligus dalam satu langkah undo", () => {
    const store = createEditorStore(EMPTY, ids());
    store.getState().removeGroups([
      { tokenIds: ["w1"], kind: "filler" },
      { tokenIds: ["p1"], kind: "pause" },
    ]);
    expect(store.getState().removed).toEqual([
      { removalId: "r1", tokenIds: ["w1"], kind: "filler" },
      { removalId: "r2", tokenIds: ["p1"], kind: "pause" },
    ]);
    store.temporal.getState().undo();
    expect(store.getState().removed).toEqual([]);
    // Grup yang semuanya sudah terpotong → tanpa perubahan & tanpa langkah undo.
    store.temporal.getState().redo();
    const before = store.getState();
    store.getState().removeGroups([{ tokenIds: ["w1"], kind: "filler" }]);
    expect(store.getState()).toBe(before);
  });

  it("memotong token yang sudah terpotong tidak mengubah state", () => {
    const store = createEditorStore(EMPTY, ids());
    store.getState().removeTokens(["w1"]);
    const before = store.getState();
    store.getState().removeTokens(["w1"]);
    expect(store.getState()).toBe(before);
  });

  it("docKey tidak terpengaruh urutan kunci koreksi", () => {
    expect(docKey({ ...EMPTY, corrections: { a: "1", b: "2" } })).toBe(
      docKey({ ...EMPTY, corrections: { b: "2", a: "1" } }),
    );
    expect(docKey({ ...EMPTY, corrections: { a: "1" } })).not.toBe(
      docKey({ ...EMPTY, corrections: { a: "2" } }),
    );
  });
});

describe("undo / redo", () => {
  const original = (id: string) => (id === "w5" ? "lima" : undefined);
  const start = () =>
    createEditorStore(
      {
        removed: [{ removalId: "r0", tokenIds: ["w9"], kind: "manual" }],
        corrections: {},
        caption: null,
        reframe: defaultReframe(),
        broll: [],
        textOverlays: [],
      },
      ids(),
    );

  it("hapus → koreksi → undo ×2 kembali ke awal; redo mengulang", () => {
    const store = start();
    const initial = docKey(store.getState());
    store.getState().removeTokens(["w1", "w2"]);
    store.getState().correct({ w5: "Lima" }, original);
    const edited = docKey(store.getState());

    store.temporal.getState().undo();
    expect(store.getState().corrections).toEqual({});
    expect(store.getState().removed).toHaveLength(2);
    store.temporal.getState().undo();
    expect(docKey(store.getState())).toBe(initial);
    expect(store.temporal.getState().pastStates).toHaveLength(0);

    store.temporal.getState().redo(2);
    expect(docKey(store.getState())).toBe(edited);
  });

  it("kursor & aksi tanpa perubahan tidak masuk riwayat", () => {
    const store = start();
    store.getState().setCursor({ caret: 3, anchor: 1 });
    store.getState().removeTokens(["w9"]);
    store.getState().restoreTokens(["w404"]);
    store.getState().correct({ w5: "lima" }, original);
    expect(store.temporal.getState().pastStates).toHaveLength(0);
  });

  it("aksi baru setelah undo membuang redo", () => {
    const store = start();
    store.getState().removeTokens(["w1"]);
    store.temporal.getState().undo();
    store.getState().removeTokens(["w2"]);
    expect(store.temporal.getState().futureStates).toHaveLength(0);
    expect(store.getState().removed.flatMap((r) => r.tokenIds)).toEqual([
      "w9",
      "w2",
    ]);
  });
});

describe("gaya caption", () => {
  const karaoke = presetStyle("karaoke");
  const clock = () => {
    let t = 0;
    const now = () => t;
    return { now, advance: (ms: number) => (t += ms) };
  };

  it("perubahan beruntun dari kontrol yang sama = satu langkah undo", () => {
    const time = clock();
    const store = createEditorStore(EMPTY, ids(), time.now);
    store.getState().setCaption({ ...karaoke, size: 82 }, "size");
    time.advance(100);
    store.getState().setCaption({ ...karaoke, size: 90 }, "size");
    time.advance(100);
    store.getState().setCaption({ ...karaoke, size: 96 }, "size");
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    store.temporal.getState().undo();
    expect(store.getState().caption).toBeNull();
    store.temporal.getState().redo();
    expect(store.getState().caption?.size).toBe(96);
  });

  it("tidak digabung: kontrol lain, jeda terlalu lama, atau ada langkah lain di antaranya", () => {
    const time = clock();
    const store = createEditorStore(EMPTY, ids(), time.now);
    store.getState().setCaption({ ...karaoke, size: 82 }, "size");
    store
      .getState()
      .setCaption({ ...karaoke, size: 82, uppercase: true }, "uppercase");
    time.advance(CAPTION_MERGE_MS + 1);
    store
      .getState()
      .setCaption({ ...karaoke, size: 90, uppercase: true }, "size");
    store.getState().removeTokens(["w1"]);
    store
      .getState()
      .setCaption({ ...karaoke, size: 96, uppercase: true }, "size");
    // Pilih preset (tanpa kontrol) selalu langkah sendiri.
    store.getState().setCaption(presetStyle("pop"));
    store.getState().setCaption(presetStyle("simple"));
    expect(store.temporal.getState().pastStates).toHaveLength(7);
  });

  it("docKey membedakan gaya caption, tidak terpengaruh urutan kuncinya", () => {
    const reordered = Object.fromEntries(
      Object.entries(karaoke).reverse(),
    ) as typeof karaoke;
    expect(docKey({ ...EMPTY, caption: karaoke })).toBe(
      docKey({ ...EMPTY, caption: reordered }),
    );
    expect(docKey({ ...EMPTY, caption: karaoke })).not.toBe(docKey(EMPTY));
    expect(docKey({ ...EMPTY, caption: karaoke })).not.toBe(
      docKey({ ...EMPTY, caption: { ...karaoke, size: 81 } }),
    );
  });
});

describe("reframe", () => {
  it("setiap perubahan satu langkah undo; nilai sama tidak menambah riwayat", () => {
    const store = createEditorStore(EMPTY, ids());
    store.getState().setReframe({ aspectRatio: "1:1" });
    store.getState().setReframe({ layout: "fit", tracker: false });
    expect(store.getState().reframe).toEqual({
      layout: "fit",
      tracker: false,
      aspectRatio: "1:1",
    });
    const before = store.getState();
    store.getState().setReframe({ layout: "fit" });
    expect(store.getState()).toBe(before);
    expect(store.temporal.getState().pastStates).toHaveLength(2);
    store.temporal.getState().undo();
    expect(store.getState().reframe).toEqual({
      ...defaultReframe(),
      aspectRatio: "1:1",
    });
  });

  it("docOf mengisi reframe kosong (EditingScript/draft lama) dengan bawaan", () => {
    expect(
      docOf({ removed: [], corrections: {}, caption: null, reframe: null })
        .reframe,
    ).toEqual(defaultReframe());
  });

  it("docKey membedakan reframe, tidak terpengaruh urutan kuncinya", () => {
    expect(
      docKey({
        ...EMPTY,
        reframe: { aspectRatio: "9:16", tracker: true, layout: "fill" },
      }),
    ).toBe(docKey(EMPTY));
    expect(
      docKey({ ...EMPTY, reframe: { ...defaultReframe(), tracker: false } }),
    ).not.toBe(docKey(EMPTY));
  });
});

describe("B-roll", () => {
  const video = (startMs: number, endMs: number, stockVideoId = 1) => ({
    startMs,
    endMs,
    stockVideoId,
    url: "https://cdn.pixabay.com/video/a_large.mp4",
    previewUrl: "https://cdn.pixabay.com/video/a_small.mp4",
    thumbnailUrl: "https://cdn.pixabay.com/video/a_small.jpg",
    pageUrl: "https://pixabay.com/videos/a-1/",
    durationMs: 6_000,
    attribution: "Video oleh Ana di Pixabay",
  });

  it("pasang, ganti (rentang sama), hapus — masing-masing satu langkah undo", () => {
    const store = createEditorStore(EMPTY, ids());
    store.getState().placeBroll(video(8_000, 10_000));
    store.getState().placeBroll(video(2_000, 4_000));
    store.getState().placeBroll(video(2_000, 4_000, 2));
    expect(
      store.getState().broll.map((b) => [b.startMs, b.stockVideoId]),
    ).toEqual([
      [2_000, 2],
      [8_000, 1],
    ]);
    store.getState().removeBroll(8_000);
    const before = store.getState();
    store.getState().removeBroll(5_000);
    expect(store.getState()).toBe(before);
    expect(store.temporal.getState().pastStates).toHaveLength(4);
    store.temporal.getState().undo();
    store.temporal.getState().undo();
    expect(
      store.getState().broll.map((b) => [b.startMs, b.stockVideoId]),
    ).toEqual([
      [2_000, 1],
      [8_000, 1],
    ]);
  });

  it("docKey membedakan B-roll; docOf mengisi B-roll kosong", () => {
    expect(docKey({ ...EMPTY, broll: [video(1_000, 3_000)] })).not.toBe(
      docKey(EMPTY),
    );
    expect(docKey({ ...EMPTY, broll: [video(1_000, 3_000)] })).not.toBe(
      docKey({ ...EMPTY, broll: [video(1_000, 3_000, 2)] }),
    );
    expect(
      docOf({ removed: [], corrections: {}, caption: null, reframe: null })
        .broll,
    ).toEqual([]);
  });
});

describe("teks custom", () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  };
  const range = { startMs: 1_000, endMs: 4_000 };

  it("tambah: gaya bawaan, terpilih, satu langkah undo; batas MAX_TEXT_OVERLAYS", () => {
    const store = createEditorStore(EMPTY, ids());
    const id = store.getState().addText(range);
    expect(id).toBe("r1");
    expect(store.getState().textOverlays).toEqual([
      { id: "r1", ...range, ...NEW_TEXT_STYLE },
    ]);
    expect(store.getState().selectedTextId).toBe("r1");
    expect(store.temporal.getState().pastStates).toHaveLength(1);
    for (let i = 1; i < MAX_TEXT_OVERLAYS; i += 1)
      store.getState().addText(range);
    expect(store.getState().textOverlays).toHaveLength(MAX_TEXT_OVERLAYS);
    expect(store.getState().addText(range)).toBeNull();
    expect(store.getState().textOverlays).toHaveLength(MAX_TEXT_OVERLAYS);
    store.temporal.getState().undo();
    expect(store.getState().textOverlays).toHaveLength(MAX_TEXT_OVERLAYS - 1);
  });

  it("memilih teks tidak masuk riwayat undo", () => {
    const store = createEditorStore(EMPTY, ids());
    store.getState().addText(range);
    store.getState().selectText(null);
    store.getState().selectText("r1");
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });

  it("ubah isi/gaya: mengetik beruntun = satu langkah undo; nilai sama tidak menambah riwayat", () => {
    const time = clock();
    const store = createEditorStore(EMPTY, ids(), time.now);
    store.getState().addText(range);
    for (const text of ["H", "Ha", "Hal", "Halo"]) {
      store.getState().updateText("r1", { text }, "text");
      time.advance(200);
    }
    store.getState().updateText("r1", { color: "#ff0000", font: "bangers" });
    store.getState().updateText("r1", { color: "#ff0000" });
    expect(store.getState().textOverlays[0]).toMatchObject({
      text: "Halo",
      color: "#ff0000",
      font: "bangers",
    });
    expect(store.temporal.getState().pastStates).toHaveLength(3);
    store.temporal.getState().undo();
    store.temporal.getState().undo();
    expect(store.getState().textOverlays[0]?.text).toBe(NEW_TEXT_STYLE.text);
  });

  it("perubahan tanpa efek tidak menggabungkan perubahan berikutnya ke langkah lain", () => {
    const store = createEditorStore(EMPTY, ids());
    store.getState().addText(range);
    // Nilai sama (tanpa entri riwayat) lalu nilai baru dari kontrol yang sama.
    store.getState().updateText("r1", { fontSize: 7 }, "size");
    store.getState().updateText("r1", { fontSize: 9 }, "size");
    expect(store.temporal.getState().pastStates).toHaveLength(2);
    store.temporal.getState().undo();
    expect(store.getState().textOverlays[0]?.fontSize).toBe(7);
  });

  it("seret posisi: satu seretan = satu langkah undo, berapa lama pun; dijepit 0–100", () => {
    const time = clock();
    const store = createEditorStore(EMPTY, ids(), time.now);
    store.getState().addText(range);
    store.getState().moveText("r1", { x: 40, y: 45 }, "g1");
    time.advance(60_000);
    store.getState().moveText("r1", { x: -10, y: 120.04 }, "g1");
    expect(store.getState().textOverlays[0]).toMatchObject({ x: 0, y: 100 });
    store.getState().moveText("r1", { x: 20, y: 20 }, "g2");
    expect(store.temporal.getState().pastStates).toHaveLength(3);
    store.temporal.getState().undo();
    expect(store.getState().textOverlays[0]).toMatchObject({ x: 0, y: 100 });
    store.temporal.getState().undo();
    expect(store.getState().textOverlays[0]).toMatchObject({ x: 50, y: 50 });
  });

  it("ubah rentang: per seretan satu langkah; rentang kosong diabaikan", () => {
    const store = createEditorStore(EMPTY, ids());
    store.getState().addText(range);
    store.getState().setTextRange("r1", { startMs: 1_500, endMs: 4_000 }, "g1");
    store.getState().setTextRange("r1", { startMs: 2_000, endMs: 4_000 }, "g1");
    store.getState().setTextRange("r1", { startMs: 3_000, endMs: 3_000 });
    expect(store.getState().textOverlays[0]).toMatchObject({
      startMs: 2_000,
      endMs: 4_000,
    });
    expect(store.temporal.getState().pastStates).toHaveLength(2);
    store.temporal.getState().undo();
    expect(store.getState().textOverlays[0]).toMatchObject(range);
  });

  it("urutan tumpuk & hapus (pilihan ikut hilang); masing-masing satu langkah undo", () => {
    const store = createEditorStore(EMPTY, ids());
    store.getState().addText(range);
    store.getState().addText(range);
    store.getState().reorderText("r2", "backward");
    expect(store.getState().textOverlays.map((t) => t.id)).toEqual([
      "r2",
      "r1",
    ]);
    store.getState().reorderText("r2", "backward");
    store.getState().selectText("r1");
    store.getState().removeText("r1");
    expect(store.getState().textOverlays.map((t) => t.id)).toEqual(["r2"]);
    expect(store.getState().selectedTextId).toBeNull();
    expect(store.temporal.getState().pastStates).toHaveLength(4);
    store.temporal.getState().undo();
    store.temporal.getState().undo();
    expect(store.getState().textOverlays.map((t) => t.id)).toEqual([
      "r1",
      "r2",
    ]);
  });

  it("docKey membedakan teks & urutan tumpuknya", () => {
    const a = { id: "a", ...range, ...NEW_TEXT_STYLE };
    const b = { ...a, id: "b" };
    expect(docKey({ ...EMPTY, textOverlays: [a, b] })).not.toBe(
      docKey({ ...EMPTY, textOverlays: [b, a] }),
    );
    expect(docKey({ ...EMPTY, textOverlays: [a] })).not.toBe(
      docKey({ ...EMPTY, textOverlays: [{ ...a, x: 51 }] }),
    );
  });
});
