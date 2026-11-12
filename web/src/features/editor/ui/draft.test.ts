import { describe, expect, it } from "vitest";
import { presetStyle } from "@/modules/captions/application";
import { defaultReframe } from "@/shared/schemas";
import {
  type Draft,
  draftDecision,
  type DraftStorage,
  readDraft,
  removeDraft,
  writeDraft,
} from "./draft";

const removed = [
  { removalId: "r1", tokenIds: ["w1"], kind: "manual" as const },
];
const fields = {
  baseVersion: 2,
  transcriptFingerprint: "fp",
  savedAt: 2_000,
  removed,
  corrections: {},
  caption: null,
  reframe: null,
  broll: [],
  textOverlays: [],
};
const draft = (overrides: Partial<Draft> = {}): Draft => ({
  format: 1,
  ...fields,
  ...overrides,
});
const server = {
  doc: {
    removed: [],
    corrections: {},
    caption: null,
    reframe: defaultReframe(),
    broll: [],
    textOverlays: [],
  },
  updatedAt: 1_000,
  transcriptFingerprint: "fp",
};

describe("draftDecision", () => {
  it("menawarkan draft yang lebih baru & berbeda dari server", () => {
    expect(draftDecision(draft(), server)).toBe("offer");
    expect(draftDecision(draft(), { ...server, updatedAt: null })).toBe(
      "offer",
    );
  });

  it("membuang draft yang tidak berguna", () => {
    expect(draftDecision(null, server)).toBe("none");
    // Lebih lama dari Save terakhir (mis. disimpan dari tab lain setelahnya).
    expect(draftDecision(draft({ savedAt: 1_000 }), server)).toBe("discard");
    // Transkrip berubah → id token draft tidak lagi cocok.
    expect(
      draftDecision(draft({ transcriptFingerprint: "lain" }), server),
    ).toBe("discard");
    // Isinya sama dengan server.
    expect(
      draftDecision(draft(), {
        ...server,
        doc: {
          removed,
          corrections: {},
          caption: null,
          reframe: defaultReframe(),
          broll: [],
          textOverlays: [],
        },
      }),
    ).toBe("discard");
    // Teks custom berbeda dari server → tetap ditawarkan.
    expect(
      draftDecision(
        draft({
          textOverlays: [
            {
              id: "t1",
              text: "Halo",
              startMs: 0,
              endMs: 1_000,
              x: 50,
              y: 50,
              fontSize: 6,
              color: "#ffffff",
              font: "inter",
            },
          ],
        }),
        {
          ...server,
          doc: { ...server.doc, removed },
        },
      ),
    ).toBe("offer");
    // Reframe berbeda dari server → tetap ditawarkan.
    expect(
      draftDecision(
        draft({ reframe: { ...defaultReframe(), aspectRatio: "1:1" } }),
        {
          ...server,
          doc: {
            removed,
            corrections: {},
            caption: null,
            reframe: defaultReframe(),
            broll: [],
            textOverlays: [],
          },
        },
      ),
    ).toBe("offer");
  });
});

function memoryStorage(): DraftStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

describe("penyimpanan draft", () => {
  it("tulis → baca → hapus; data rusak dianggap tidak ada", () => {
    const storage = memoryStorage();
    writeDraft("c1", fields, storage);
    expect(readDraft("c1", storage)).toEqual(draft());
    expect(readDraft("c2", storage)).toBeNull();
    removeDraft("c1", storage);
    expect(readDraft("c1", storage)).toBeNull();
    storage.setItem("clipstudio:draft:c1", "{bukan json");
    expect(readDraft("c1", storage)).toBeNull();
    storage.setItem("clipstudio:draft:c1", '{"format":2}');
    expect(readDraft("c1", storage)).toBeNull();
  });

  it("gaya caption ikut tersimpan; draft lama tanpa caption → bawaan", () => {
    const storage = memoryStorage();
    const caption = presetStyle("pop");
    writeDraft("c1", { ...fields, caption }, storage);
    expect(readDraft("c1", storage)?.caption).toEqual(caption);
    const old: Partial<Draft> = { format: 1, ...fields };
    delete old.caption;
    storage.setItem("clipstudio:draft:c1", JSON.stringify(old));
    expect(readDraft("c1", storage)?.caption).toBeNull();
  });

  it("B-roll ikut tersimpan; draft lama tanpa B-roll → kosong", () => {
    const storage = memoryStorage();
    const broll = [
      {
        startMs: 1_000,
        endMs: 3_000,
        stockVideoId: 7,
        url: "https://cdn.pixabay.com/video/a_large.mp4",
        previewUrl: "https://cdn.pixabay.com/video/a_small.mp4",
        thumbnailUrl: "https://cdn.pixabay.com/video/a_small.jpg",
        pageUrl: "https://pixabay.com/videos/a-7/",
        durationMs: 5_000,
        attribution: "Video oleh Ana di Pixabay",
      },
    ];
    writeDraft("c1", { ...fields, broll }, storage);
    expect(readDraft("c1", storage)?.broll).toEqual(broll);
    const old: Partial<Draft> = { format: 1, ...fields };
    delete old.broll;
    storage.setItem("clipstudio:draft:c1", JSON.stringify(old));
    expect(readDraft("c1", storage)?.broll).toEqual([]);
  });

  it("teks custom ikut tersimpan; draft lama tanpa teks → kosong", () => {
    const storage = memoryStorage();
    const textOverlays = [
      {
        id: "t1",
        text: "Não é só isso, né?",
        startMs: 1_000,
        endMs: 4_000,
        x: 50,
        y: 80,
        fontSize: 6,
        color: "#ffffff",
        font: "montserrat" as const,
      },
    ];
    writeDraft("c1", { ...fields, textOverlays }, storage);
    expect(readDraft("c1", storage)?.textOverlays).toEqual(textOverlays);
    const old: Partial<Draft> = { format: 1, ...fields };
    delete old.textOverlays;
    storage.setItem("clipstudio:draft:c1", JSON.stringify(old));
    expect(readDraft("c1", storage)?.textOverlays).toEqual([]);
  });

  it("reframe ikut tersimpan; draft lama tanpa reframe → null (bawaan)", () => {
    const storage = memoryStorage();
    const reframe = {
      layout: "fit" as const,
      tracker: false,
      aspectRatio: "16:9" as const,
    };
    writeDraft("c1", { ...fields, reframe }, storage);
    expect(readDraft("c1", storage)?.reframe).toEqual(reframe);
    const old: Partial<Draft> = { format: 1, ...fields };
    delete old.reframe;
    storage.setItem("clipstudio:draft:c1", JSON.stringify(old));
    expect(readDraft("c1", storage)?.reframe).toBeNull();
  });

  it("storage yang melempar error (mode privat / penuh) diabaikan", () => {
    const broken: DraftStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => writeDraft("c1", fields, broken)).not.toThrow();
    expect(readDraft("c1", broken)).toBeNull();
    expect(() => removeDraft("c1", broken)).not.toThrow();
  });
});
