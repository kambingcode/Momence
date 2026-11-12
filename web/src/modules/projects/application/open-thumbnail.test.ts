import { describe, expect, it } from "vitest";
import type { ByteRange } from "../domain/byte-range";
import { OpenThumbnail } from "./open-thumbnail";
import type {
  MediaStorage,
  ProjectRepository,
  ProjectWithSource,
} from "./ports";

function projectWith(proxyPath: string | null): ProjectWithSource {
  return {
    id: "p1",
    name: "Video",
    createdAt: 0,
    source: {
      id: "s1",
      projectId: "p1",
      originalName: "a.mp4",
      path: "media/p1/source.mp4",
      sizeBytes: 10,
      durationMs: null,
      width: null,
      height: null,
      proxyPath,
    },
  };
}

function repo(found: ProjectWithSource | null): ProjectRepository {
  return {
    create: async () => {},
    delete: async () => {},
    deleteIfIdle: async () => ({ status: "deleted" }),
    get: async () => found,
    list: async () => [],
  };
}

class FakeStorage implements MediaStorage {
  readonly reads: Array<{ path: string; range: ByteRange }> = [];
  constructor(private readonly sizes: Record<string, number>) {}
  async listMediaFiles(): Promise<never> {
    throw new Error("tidak dipakai");
  }
  async diskSpace(): Promise<never> {
    throw new Error("tidak dipakai");
  }
  async saveSource(): Promise<never> {
    throw new Error("tidak dipakai");
  }
  async removeProject() {}
  async fileSize(path: string) {
    return this.sizes[path] ?? null;
  }
  readFile(path: string, range: ByteRange) {
    this.reads.push({ path, range });
    return new ReadableStream<Uint8Array>();
  }
}

const PROXY = "media/p1/proxy.mp4";
const THUMB = "media/p1/thumb.jpg";

describe("OpenThumbnail", () => {
  it("membaca thumb.jpg di folder proxy sebagai satu file utuh", async () => {
    const storage = new FakeStorage({ [THUMB]: 1234 });
    const thumbnail = await new OpenThumbnail(
      repo(projectWith(PROXY)),
      storage,
    ).execute("p1");
    expect(thumbnail).toMatchObject({ status: "ok", size: 1234 });
    expect(storage.reads).toEqual([
      { path: THUMB, range: { start: 0, end: 1233 } },
    ]);
  });

  it("proyek tidak ada → not_found", async () => {
    expect(
      await new OpenThumbnail(repo(null), new FakeStorage({})).execute("p1"),
    ).toEqual({ status: "not_found" });
  });

  it("proxy belum dibuat → not_ready", async () => {
    expect(
      await new OpenThumbnail(
        repo(projectWith(null)),
        new FakeStorage({ [THUMB]: 10 }),
      ).execute("p1"),
    ).toEqual({ status: "not_ready" });
  });

  it("file thumbnail belum ada atau kosong → not_ready tanpa membaca", async () => {
    for (const sizes of [{}, { [THUMB]: 0 }] as Record<string, number>[]) {
      const storage = new FakeStorage(sizes);
      expect(
        await new OpenThumbnail(repo(projectWith(PROXY)), storage).execute(
          "p1",
        ),
      ).toEqual({ status: "not_ready" });
      expect(storage.reads).toEqual([]);
    }
  });
});
