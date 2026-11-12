import { describe, expect, it } from "vitest";
import type { Clip } from "@/modules/clips/application";
import type { ClipEditorData } from "@/modules/editor/application";
import type { Job, NewJob } from "@/modules/jobs/application";
import { GetBrollPlan, StartBrollPlan } from "./clip-broll-plan";

const clip = {
  id: "c1",
  projectId: "p1",
  title: "Rahasia nabung",
  startMs: 0,
  endMs: 3_000,
} as unknown as Clip;

const tokens = [
  {
    id: "w1",
    type: "word",
    text: "Halo",
    startMs: 0,
    endMs: 500,
    confidence: 0.9,
  },
  {
    id: "w2",
    type: "word",
    text: "nabung.",
    startMs: 500,
    endMs: 3_000,
    confidence: null,
  },
] as ClipEditorData["tokens"];

const slot = {
  startMs: 4_000,
  endMs: 6_000,
  sentence: 2,
  text: "Lihat celengan ini.",
  intent: "Celengan",
  keywords: ["piggy bank"],
};

const job = (
  id: string,
  status: Job["status"],
  clipId: string,
  extra: Partial<Job> = {},
) =>
  ({
    id,
    type: "broll-plan",
    status,
    payload: { clipId, title: "", tokens: [] },
    result: null,
    error: null,
    ...extra,
  }) as unknown as Job;

function setup(jobs: Job[]) {
  const get = new GetBrollPlan(
    { get: async (id) => (id === clip.id ? clip : null) },
    { execute: async () => jobs },
  );
  const queued: NewJob[] = [];
  const start = new StartBrollPlan(
    {
      execute: async (id) =>
        id === clip.id ? ({ clip, tokens } as ClipEditorData) : null,
    },
    get,
    {
      execute: async (newJob) => {
        queued.push(newJob);
        return { id: "baru", status: "queued", ...newJob } as unknown as Job;
      },
    },
  );
  return { get, start, queued };
}

describe("GetBrollPlan", () => {
  it("status & slot dari job broll-plan terbaru untuk klip ini", async () => {
    const done = job("j2", "done", "c1", {
      result: { clipId: "c1", slots: [slot] },
    });
    // Job klip lain & tipe lain diabaikan; yang terbaru (pertama) dipakai.
    const other = job("j0", "running", "c2");
    const render = { ...job("j9", "running", "c1"), type: "render" } as Job;
    expect(
      await setup([other, render, done, job("j1", "failed", "c1")]).get.execute(
        "c1",
      ),
    ).toEqual({ status: "ready", job: done, slots: [slot] });
    expect(
      (await setup([job("j3", "queued", "c1")]).get.execute("c1"))?.status,
    ).toBe("pending");
    expect(
      (await setup([job("j3", "failed", "c1")]).get.execute("c1"))?.status,
    ).toBe("failed");
    expect(await setup([other]).get.execute("c1")).toEqual({
      status: "missing",
      job: null,
      slots: [],
    });
    expect(await setup([]).get.execute("x")).toBeNull();
  });

  it("hasil rusak dianggap gagal", async () => {
    const broken = job("j1", "done", "c1", { result: { slots: "?" } });
    expect((await setup([broken]).get.execute("c1"))?.status).toBe("failed");
  });
});

describe("StartBrollPlan", () => {
  it("mengantre token yang dipertahankan dengan teks koreksi", async () => {
    const { start, queued } = setup([]);
    expect(
      await start.execute("c1", {
        removedTokenIds: ["w1"],
        corrections: { w2: "menabung." },
      }),
    ).toMatchObject({ status: "started", job: { id: "baru" } });
    expect(queued).toEqual([
      {
        projectId: "p1",
        type: "broll-plan",
        payload: {
          clipId: "c1",
          title: "Rahasia nabung",
          tokens: [
            {
              id: "w2",
              type: "word",
              text: "menabung.",
              startMs: 500,
              endMs: 3_000,
            },
          ],
        },
      },
    ]);
  });

  it("job berjalan dipakai ulang; semua terhapus / klip tidak ada ditolak", async () => {
    const running = job("j1", "running", "c1");
    const busy = setup([running]);
    expect(
      await busy.start.execute("c1", { removedTokenIds: [], corrections: {} }),
    ).toEqual({ status: "started", job: running });
    expect(busy.queued).toEqual([]);

    const { start, queued } = setup([]);
    expect(
      await start.execute("c1", {
        removedTokenIds: ["w1", "w2"],
        corrections: {},
      }),
    ).toMatchObject({ status: "invalid" });
    expect(
      await start.execute("x", { removedTokenIds: [], corrections: {} }),
    ).toEqual({ status: "not_found" });
    expect(queued).toEqual([]);
  });
});
