import { describe, expect, it } from "vitest";
import { categoryOf } from "../domain/storage";
import { GetStorageOverview } from "./get-storage-overview";

describe("categoryOf", () => {
  it("mengelompokkan file folder proyek menurut jenisnya", () => {
    expect(categoryOf("source.mov")).toBe("source");
    expect(categoryOf("proxy.mp4")).toBe("proxy");
    expect(categoryOf("audio.wav")).toBe("audio");
    expect(categoryOf("renders/j1.mp4")).toBe("renders");
    // File sementara bukan bagian dari jenis mana pun.
    expect(categoryOf("source.mp4.part")).toBe("other");
    expect(categoryOf(".proxy.mp4.12.part")).toBe("other");
    expect(categoryOf("renders/.j1.12.part.mp4")).toBe("other");
    expect(categoryOf("catatan.txt")).toBe("other");
  });
});

describe("GetStorageOverview", () => {
  it("menjumlahkan per proyek, total, dan meneruskan sisa disk", async () => {
    const overview = await new GetStorageOverview({
      listMediaFiles: async () => [
        { projectId: "p1", path: "source.mp4", sizeBytes: 100 },
        { projectId: "p1", path: "proxy.mp4", sizeBytes: 40 },
        { projectId: "p1", path: "renders/j1.mp4", sizeBytes: 10 },
        { projectId: "p2", path: "audio.wav", sizeBytes: 5 },
      ],
      diskSpace: async () => ({ freeBytes: 1_000, totalBytes: 5_000 }),
    }).execute();

    expect(overview.projects.p1).toEqual({
      source: 100,
      proxy: 40,
      audio: 0,
      renders: 10,
      other: 0,
      total: 150,
    });
    expect(overview.projects.p2?.total).toBe(5);
    expect(overview.total.total).toBe(155);
    expect(overview.disk).toEqual({ freeBytes: 1_000, totalBytes: 5_000 });
  });
});
