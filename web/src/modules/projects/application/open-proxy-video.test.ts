import { describe, expect, it } from "vitest";
import type { ByteRange } from "../domain/byte-range";
import { OpenProxyVideo } from "./open-proxy-video";
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
  async listMediaFiles(): Promise<never> {
    throw new Error("tidak dipakai");
  }
  async diskSpace(): Promise<never> {
    throw new Error("tidak dipakai");
  }
  readonly reads: Array<{ path: string; range: ByteRange }> = [];
  constructor(private readonly sizes: Record<string, number>) {}
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

describe("OpenProxyVideo", () => {
  it("tanpa Range → seluruh file", async () => {
    const storage = new FakeStorage({ [PROXY]: 1000 });
    const video = await new OpenProxyVideo(
      repo(projectWith(PROXY)),
      storage,
    ).execute("p1", null);
    expect(video).toMatchObject({ status: "ok", size: 1000, range: null });
    expect(storage.reads).toEqual([
      { path: PROXY, range: { start: 0, end: 999 } },
    ]);
  });

  it("dengan Range → sebagian file", async () => {
    const storage = new FakeStorage({ [PROXY]: 1000 });
    const video = await new OpenProxyVideo(
      repo(projectWith(PROXY)),
      storage,
    ).execute("p1", "bytes=500-");
    expect(video).toMatchObject({
      status: "ok",
      range: { start: 500, end: 999 },
    });
    expect(storage.reads[0].range).toEqual({ start: 500, end: 999 });
  });

  it("Range di luar file → unsatisfiable tanpa membaca", async () => {
    const storage = new FakeStorage({ [PROXY]: 1000 });
    const video = await new OpenProxyVideo(
      repo(projectWith(PROXY)),
      storage,
    ).execute("p1", "bytes=2000-");
    expect(video).toEqual({ status: "unsatisfiable", size: 1000 });
    expect(storage.reads).toEqual([]);
  });

  it("proyek tidak ada / proxy belum dibuat / file proxy hilang", async () => {
    const storage = new FakeStorage({});
    expect(
      await new OpenProxyVideo(repo(null), storage).execute("p1", null),
    ).toEqual({ status: "not_found" });
    expect(
      await new OpenProxyVideo(repo(projectWith(null)), storage).execute(
        "p1",
        null,
      ),
    ).toEqual({ status: "not_ready" });
    expect(
      await new OpenProxyVideo(repo(projectWith(PROXY)), storage).execute(
        "p1",
        null,
      ),
    ).toEqual({ status: "not_ready" });
  });
});
