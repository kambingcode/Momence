import { describe, expect, it } from "vitest";
import type { Clip } from "@/modules/clips/application";
import type { Job, NewJob } from "@/modules/jobs/application";
import type { CropTracks } from "@/shared/schemas";
import { GetClipReframe, StartClipReframe } from "./clip-reframe";

const clip = {
  id: "c1",
  projectId: "p1",
  startMs: 0,
  endMs: 30_000,
} as unknown as Clip;

const crops: CropTracks = { "9:16": [], "1:1": [], "16:9": [] };

const job = (
  id: string,
  status: Job["status"],
  clipIds: string[],
  type: Job["type"] = "reframe",
) => ({ id, type, status, payload: { clipIds } }) as unknown as Job;

function setup(jobs: Job[], cropTracks: CropTracks | null = null) {
  const get = new GetClipReframe(
    { get: async (id) => (id === clip.id ? clip : null) },
    { execute: async () => cropTracks },
    { execute: async () => jobs },
  );
  const queued: NewJob[] = [];
  const start = new StartClipReframe(
    { get: async (id) => (id === clip.id ? clip : null) },
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

describe("GetClipReframe", () => {
  it("status dari jalur crop & job reframe terbaru yang mencakup klip", async () => {
    const other = job("j0", "running", ["c2"]);
    expect(await setup([], crops).get.execute("c1")).toEqual({
      status: "ready",
      job: null,
      cropTracks: crops,
    });
    expect(
      (
        await setup([other, job("j1", "running", ["c2", "c1"])]).get.execute(
          "c1",
        )
      )?.status,
    ).toBe("pending");
    expect(
      (await setup([job("j1", "failed", ["c1"])]).get.execute("c1"))?.status,
    ).toBe("failed");
    // Job lain (bukan reframe / klip lain) tidak dihitung.
    expect(
      (
        await setup([
          other,
          job("j2", "running", ["c1"], "render"),
        ]).get.execute("c1")
      )?.status,
    ).toBe("missing");
    expect(await setup([]).get.execute("x")).toBeNull();
  });
});

describe("StartClipReframe", () => {
  it("mengantre job reframe untuk klip ini", async () => {
    const { start, queued } = setup([job("j1", "failed", ["c1"])]);
    expect(await start.execute("c1")).toMatchObject({
      status: "started",
      job: { id: "baru" },
    });
    expect(queued).toEqual([
      { projectId: "p1", type: "reframe", payload: { clipIds: ["c1"] } },
    ]);
  });

  it("job yang masih berjalan dipakai ulang; klip tidak ada → not_found", async () => {
    const { start, queued } = setup([job("j1", "queued", ["c1"])]);
    expect(await start.execute("c1")).toMatchObject({ job: { id: "j1" } });
    expect(queued).toEqual([]);
    expect(await start.execute("x")).toEqual({ status: "not_found" });
  });
});
