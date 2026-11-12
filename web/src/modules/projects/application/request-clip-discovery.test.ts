import { describe, expect, it } from "vitest";
import type { EnqueueJob, Job, NewJob } from "@/modules/jobs/application";
import type { ProjectWithSource } from "./ports";
import { RequestClipDiscovery } from "./request-clip-discovery";

function job(type: string, status: Job["status"]): Job {
  return {
    id: `${type}-${status}`,
    projectId: "p1",
    type,
    status,
    progress: status === "done" ? 100 : 0,
    payload: {},
    result: null,
    error: null,
    attempts: 1,
    createdAt: 1,
    updatedAt: 1,
    startedAt: null,
    finishedAt: null,
  };
}

const PROJECT: ProjectWithSource = {
  id: "p1",
  name: "Stream",
  clipFocus: "tips praktis",
  createdAt: 1,
  source: {
    id: "s1",
    projectId: "p1",
    originalName: "a.mp4",
    path: "media/p1/source.mp4",
    sizeBytes: 1,
    durationMs: 1000,
    width: 1920,
    height: 1080,
    proxyPath: "media/p1/proxy.mp4",
  },
};

const PIPELINE_DONE = [
  job("ingest", "done"),
  job("transcribe", "done"),
  job("discover", "done"),
  job("reframe", "done"),
];

function setup(options: {
  project?: ProjectWithSource | null;
  jobs?: Job[];
  enqueueError?: Error;
}) {
  const focus: Array<string | null> = [];
  const enqueued: NewJob[] = [];
  const project = options.project === undefined ? PROJECT : options.project;
  const useCase = new RequestClipDiscovery(
    {
      get: async () => project,
      setClipFocus: async (_id, value) => {
        focus.push(value);
        return true;
      },
    },
    { execute: async () => new Map([["p1", options.jobs ?? PIPELINE_DONE]]) },
    {
      execute: async (input) => {
        if (options.enqueueError) throw options.enqueueError;
        enqueued.push(input);
        return { ...job("discover", "queued"), id: "baru" };
      },
    } satisfies Pick<EnqueueJob, "execute">,
  );
  return { useCase, focus, enqueued };
}

describe("RequestClipDiscovery", () => {
  it("menyimpan fokus baru lalu mengantre discover untuk sumber proyek", async () => {
    const { useCase, focus, enqueued } = setup({});
    const result = await useCase.execute({
      projectId: "p1",
      clipFocus: "momen lucu",
    });

    expect(result).toMatchObject({ status: "queued", job: { id: "baru" } });
    expect(focus).toEqual(["momen lucu"]);
    expect(enqueued).toEqual([
      { projectId: "p1", type: "discover", payload: { sourceId: "s1" } },
    ]);
  });

  it("fokus null menghapus fokus lama", async () => {
    const { useCase, focus } = setup({});
    await useCase.execute({ projectId: "p1", clipFocus: null });
    expect(focus).toEqual([null]);
  });

  it("not_found untuk proyek yang tidak ada, tanpa antre apa pun", async () => {
    const { useCase, focus, enqueued } = setup({ project: null });
    expect(await useCase.execute({ projectId: "x", clipFocus: null })).toEqual({
      status: "not_found",
    });
    expect(focus).toEqual([]);
    expect(enqueued).toEqual([]);
  });

  it.each(["transcribe", "discover", "reframe"])(
    "busy bila job %s masih antre/berjalan",
    async (type) => {
      const { useCase, focus, enqueued } = setup({
        jobs: [
          ...PIPELINE_DONE.filter((j) => j.type !== type),
          job(type, "running"),
        ],
      });
      expect(
        await useCase.execute({ projectId: "p1", clipFocus: "x" }),
      ).toEqual({ status: "busy", jobType: type });
      expect(focus).toEqual([]);
      expect(enqueued).toEqual([]);
    },
  );

  it.each(["download", "ingest"])(
    "job %s (video penuh masih diproses) tidak menghalangi",
    async (type) => {
      const { useCase } = setup({
        jobs: [
          ...PIPELINE_DONE.filter((j) => j.type !== type),
          job(type, "running"),
        ],
      });
      expect(
        (await useCase.execute({ projectId: "p1", clipFocus: "x" })).status,
      ).toBe("queued");
    },
  );

  it("job render yang berjalan tidak menghalangi", async () => {
    const { useCase } = setup({
      jobs: [...PIPELINE_DONE, job("render", "running")],
    });
    expect(
      (await useCase.execute({ projectId: "p1", clipFocus: "x" })).status,
    ).toBe("queued");
  });

  it("not_ready bila transkrip belum selesai atau gagal", async () => {
    for (const jobs of [
      [job("ingest", "done")],
      [job("ingest", "done"), job("transcribe", "failed")],
    ]) {
      const { useCase, enqueued } = setup({ jobs });
      const result = await useCase.execute({ projectId: "p1", clipFocus: "x" });
      expect(result.status).toBe("not_ready");
      expect(enqueued).toEqual([]);
    }
  });

  it("mengembalikan fokus lama bila antre job gagal", async () => {
    const { useCase, focus } = setup({ enqueueError: new Error("DB sibuk") });
    await expect(
      useCase.execute({ projectId: "p1", clipFocus: "baru" }),
    ).rejects.toThrow("DB sibuk");
    expect(focus).toEqual(["baru", "tips praktis"]);
  });
});
