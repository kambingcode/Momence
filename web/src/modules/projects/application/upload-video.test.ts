import { describe, expect, it } from "vitest";
import type { EnqueueJob, Job, NewJob } from "@/modules/jobs/application";
import type { Project, Source } from "../domain/project";
import { InvalidVideoFileError } from "../domain/video-file";
import type { MediaStorage, ProjectRepository } from "./ports";
import { UploadVideo } from "./upload-video";

class FakeProjects implements ProjectRepository {
  readonly rows = new Map<string, { project: Project; source: Source }>();
  async create(project: Project, source: Source) {
    this.rows.set(project.id, { project, source });
  }
  async delete(projectId: string) {
    this.rows.delete(projectId);
  }
  async deleteIfIdle(): Promise<never> {
    throw new Error("tidak dipakai");
  }
  async get() {
    return null;
  }
  async list() {
    return [...this.rows.values()].map(({ project, source }) => ({
      ...project,
      source: {
        ...source,
        durationMs: null,
        width: null,
        height: null,
        proxyPath: null,
      },
    }));
  }
}

class FakeStorage implements MediaStorage {
  async listMediaFiles(): Promise<never> {
    throw new Error("tidak dipakai");
  }
  async diskSpace(): Promise<never> {
    throw new Error("tidak dipakai");
  }
  readonly files = new Map<string, number>();
  async saveSource(
    projectId: string,
    extension: string,
    data: ReadableStream<Uint8Array>,
  ) {
    let size = 0;
    const reader = data.getReader();
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      size += r.value.byteLength;
    }
    const path = `media/${projectId}/source.${extension}`;
    this.files.set(projectId, size);
    return { path, sizeBytes: size };
  }
  async removeProject(projectId: string) {
    this.files.delete(projectId);
  }
  async fileSize() {
    return null;
  }
  readFile(): ReadableStream<Uint8Array> {
    throw new Error("tidak dipakai");
  }
}

function streamOf(...chunks: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const n of chunks) controller.enqueue(new Uint8Array(n));
      controller.close();
    },
  });
}

class FakeEnqueue implements Pick<EnqueueJob, "execute"> {
  readonly jobs: Job[] = [];
  async execute(input: NewJob): Promise<Job> {
    const job: Job = {
      ...input,
      id: `job${this.jobs.length + 1}`,
      status: "queued",
      progress: 0,
      result: null,
      error: null,
      attempts: 0,
      createdAt: 0,
      updatedAt: 0,
      startedAt: null,
      finishedAt: null,
    };
    this.jobs.push(job);
    return job;
  }
}

function setup(enqueue?: Pick<EnqueueJob, "execute">) {
  const projects = new FakeProjects();
  const storage = new FakeStorage();
  const jobs = new FakeEnqueue();
  let id = 0;
  const upload = new UploadVideo(
    projects,
    storage,
    enqueue ?? jobs,
    { next: () => `id${++id}` },
    { now: () => 42 },
  );
  return { upload, projects, storage, jobs };
}

describe("UploadVideo", () => {
  it("menyimpan file, membuat proyek + sumber, dan mengantre ingest", async () => {
    const { upload, projects, storage, jobs } = setup();
    const result = await upload.execute({
      filename: "Podcast.MP4",
      data: streamOf(3, 4),
    });

    expect(result.project).toEqual({
      id: "id1",
      name: "Podcast",
      clipFocus: null,
      createdAt: 42,
    });
    expect(result.source).toMatchObject({
      id: "id2",
      projectId: "id1",
      path: "media/id1/source.mp4",
      sizeBytes: 7,
    });
    expect(result.job).toMatchObject({
      projectId: "id1",
      type: "ingest",
      payload: { sourceId: "id2" },
    });
    expect(projects.rows.has("id1")).toBe(true);
    expect(storage.files.get("id1")).toBe(7);
    expect(jobs.jobs).toHaveLength(1);
  });

  it("menyimpan fokus klip pada proyek", async () => {
    const { upload, projects } = setup();
    await upload.execute({
      filename: "Stream.mp4",
      clipFocus: "momen lucu",
      data: streamOf(3),
    });
    expect(projects.rows.get("id1")?.project.clipFocus).toBe("momen lucu");
  });

  it("menolak format bukan video sebelum menulis apa pun", async () => {
    const { upload, storage } = setup();
    await expect(
      upload.execute({ filename: "a.txt", data: streamOf(1) }),
    ).rejects.toThrow(InvalidVideoFileError);
    expect(storage.files.size).toBe(0);
  });

  it("menolak file kosong dan menghapus foldernya", async () => {
    const { upload, storage, projects } = setup();
    await expect(
      upload.execute({ filename: "a.mp4", data: streamOf() }),
    ).rejects.toThrow("File kosong.");
    expect(storage.files.size).toBe(0);
    expect(projects.rows.size).toBe(0);
  });

  it("membatalkan proyek & file bila job ingest gagal diantre", async () => {
    const { upload, storage, projects } = setup({
      execute: () => Promise.reject(new Error("DB sibuk")),
    });
    await expect(
      upload.execute({ filename: "a.mp4", data: streamOf(5) }),
    ).rejects.toThrow("DB sibuk");
    expect(projects.rows.size).toBe(0);
    expect(storage.files.size).toBe(0);
  });
});
