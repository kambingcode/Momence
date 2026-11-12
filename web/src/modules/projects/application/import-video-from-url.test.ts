import { describe, expect, it } from "vitest";
import type { EnqueueJob, Job, NewJob } from "@/modules/jobs/application";
import type { Project, Source } from "../domain/project";
import { InvalidVideoUrlError } from "../domain/video-url";
import { ImportVideoFromUrl } from "./import-video-from-url";
import type { ProjectRepository } from "./ports";

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
  async list(): Promise<never> {
    throw new Error("tidak dipakai");
  }
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
  const jobs = new FakeEnqueue();
  let id = 0;
  const importer = new ImportVideoFromUrl(
    projects,
    enqueue ?? jobs,
    { next: () => `id${++id}` },
    { now: () => 42 },
  );
  return { importer, projects, jobs };
}

describe("ImportVideoFromUrl", () => {
  it("membuat proyek + sumber kosong dan mengantre unduhan audio & video dengan link kanonis", async () => {
    const { importer, projects, jobs } = setup();
    const result = await importer.execute({
      url: "https://youtu.be/dQw4w9WgXcQ?si=abc",
    });

    expect(result.project).toEqual({
      id: "id1",
      name: "YouTube dQw4w9WgXcQ",
      clipFocus: null,
      createdAt: 42,
    });
    expect(result.source).toEqual({
      id: "id2",
      projectId: "id1",
      originalName: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      path: "media/id1/source.mp4",
      sizeBytes: 0,
    });
    // Audio lebih dulu (mengantre transkripsi); video penuh menyusul dan tahu audionya sudah ada.
    expect(result.audioJob).toMatchObject({
      projectId: "id1",
      type: "download-audio",
      payload: {
        sourceId: "id2",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    });
    expect(result.job).toMatchObject({
      projectId: "id1",
      type: "download",
      payload: {
        sourceId: "id2",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        audioFirst: true,
      },
    });
    expect(projects.rows.has("id1")).toBe(true);
    expect(jobs.jobs.map((job) => job.type)).toEqual([
      "download-audio",
      "download",
    ]);
  });

  it("mengimpor VOD Twitch dengan nama sementara & link kanonis", async () => {
    const { importer, jobs } = setup();
    const result = await importer.execute({
      url: "twitch.tv/videos/2907356012?t=2h",
    });

    expect(result.project.name).toBe("Twitch 2907356012");
    expect(result.source.originalName).toBe(
      "https://www.twitch.tv/videos/2907356012",
    );
    for (const job of jobs.jobs)
      expect(job.payload).toMatchObject({
        url: "https://www.twitch.tv/videos/2907356012",
      });
  });

  it("meneruskan pilihan kualitas ke job video saja; tanpa pilihan = bawaan", async () => {
    const chosen = setup();
    await chosen.importer.execute({
      url: "https://youtu.be/dQw4w9WgXcQ",
      maxResolution: 720,
    });
    expect(chosen.jobs.jobs.map((job) => job.payload)).toEqual([
      expect.not.objectContaining({ maxResolution: expect.anything() }),
      expect.objectContaining({ audioFirst: true, maxResolution: 720 }),
    ]);

    const byDefault = setup();
    await byDefault.importer.execute({ url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(byDefault.jobs.jobs[1].payload).not.toHaveProperty("maxResolution");
  });

  it("menyimpan fokus klip pada proyek", async () => {
    const { importer, projects } = setup();
    await importer.execute({
      url: "https://youtu.be/dQw4w9WgXcQ",
      clipFocus: "tips praktis",
    });
    expect(projects.rows.get("id1")?.project.clipFocus).toBe("tips praktis");
  });

  it("menolak klip Twitch tanpa membuat proyek", async () => {
    const { importer, projects, jobs } = setup();
    await expect(
      importer.execute({ url: "https://clips.twitch.tv/Slug" }),
    ).rejects.toThrow(InvalidVideoUrlError);
    expect(projects.rows.size).toBe(0);
    expect(jobs.jobs).toHaveLength(0);
  });

  it("menolak link yang bukan video YouTube/Twitch tanpa membuat proyek", async () => {
    const { importer, projects, jobs } = setup();
    await expect(
      importer.execute({ url: "https://vimeo.com/1" }),
    ).rejects.toThrow(InvalidVideoUrlError);
    expect(projects.rows.size).toBe(0);
    expect(jobs.jobs).toHaveLength(0);
  });

  it("membatalkan proyek bila job video gagal diantre setelah job audio", async () => {
    const queued: Job[] = [];
    const { importer, projects } = setup({
      execute: async (input) => {
        if (input.type === "download") throw new Error("DB sibuk");
        const job = { ...input, id: "a" } as unknown as Job;
        queued.push(job);
        return job;
      },
    });
    await expect(
      importer.execute({ url: "https://youtu.be/dQw4w9WgXcQ" }),
    ).rejects.toThrow("DB sibuk");
    expect(queued).toHaveLength(1);
    expect(projects.rows.size).toBe(0);
  });

  it("membatalkan proyek bila job download gagal diantre", async () => {
    const { importer, projects } = setup({
      execute: () => Promise.reject(new Error("DB sibuk")),
    });
    await expect(
      importer.execute({ url: "https://youtu.be/dQw4w9WgXcQ" }),
    ).rejects.toThrow("DB sibuk");
    expect(projects.rows.size).toBe(0);
  });
});
