import { describe, expect, it } from "vitest";
import type { Clip } from "@/modules/clips/application";
import type { Job, NewJob } from "@/modules/jobs/application";
import { GetPostCopy, StartPostCopy } from "./clip-post-copy";

const clip = {
  id: "c1",
  projectId: "p1",
  title: "Rahasia nabung",
  details: { hook: "Gaji kecil tetap bisa nabung" },
} as unknown as Clip;

const tokens = [
  { type: "word" as const, text: "Halo" },
  { type: "filler" as const, text: "eh" },
  { type: "pause" as const, text: "" },
  { type: "word" as const, text: "nabung." },
];

const copy = {
  clipId: "c1",
  platform: "tiktok",
  caption: "Nabung itu soal urutan",
  altCaption: "",
  hashtags: ["#nabung", "#gajikecil"],
};

const job = (
  id: string,
  status: Job["status"],
  clipId: string,
  extra: Partial<Job> = {},
) =>
  ({
    id,
    type: "post-copy",
    status,
    payload: {
      clipId,
      title: "",
      hook: "",
      platform: "tiktok",
      language: null,
      transcript: "",
    },
    result: null,
    error: null,
    ...extra,
  }) as unknown as Job;

function setup(jobs: Job[], speech = tokens) {
  const get = new GetPostCopy(
    { get: async (id) => (id === clip.id ? clip : null) },
    { execute: async () => jobs },
  );
  const queued: NewJob[] = [];
  const start = new StartPostCopy(
    {
      execute: async (id) => (id === clip.id ? { clip, tokens: speech } : null),
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

describe("GetPostCopy", () => {
  it("status & hasil dari job post-copy terbaru untuk klip ini", async () => {
    const done = job("j2", "done", "c1", { result: copy });
    // Job klip lain & tipe lain diabaikan; yang terbaru (pertama) dipakai.
    const other = job("j0", "running", "c2");
    const render = { ...job("j9", "running", "c1"), type: "render" } as Job;
    expect(
      await setup([other, render, done, job("j1", "failed", "c1")]).get.execute(
        "c1",
      ),
    ).toEqual({ status: "ready", job: done, copy });
    expect(
      (await setup([job("j3", "queued", "c1")]).get.execute("c1"))?.status,
    ).toBe("pending");
    expect(
      (await setup([job("j3", "running", "c1")]).get.execute("c1"))?.status,
    ).toBe("pending");
    expect(await setup([other]).get.execute("c1")).toEqual({
      status: "missing",
      job: null,
      copy: null,
    });
  });

  it("job gagal membawa pesan; hasil rusak dianggap gagal", async () => {
    const failed = job("j3", "failed", "c1", { error: "kuota habis" });
    expect(await setup([failed]).get.execute("c1")).toEqual({
      status: "failed",
      job: failed,
      copy: null,
    });
    const broken = job("j4", "done", "c1", { result: { clipId: "c1" } });
    expect((await setup([broken]).get.execute("c1"))?.status).toBe("failed");
  });

  it("null untuk klip yang tidak ada", async () => {
    expect(await setup([]).get.execute("x")).toBeNull();
  });
});

describe("StartPostCopy", () => {
  it("antre job dengan ucapan klip, hook, platform & bahasa", async () => {
    const { start, queued } = setup([]);
    const result = await start.execute("c1", {
      platform: "reels",
      language: "en",
    });
    expect(result.status).toBe("started");
    expect(queued).toEqual([
      {
        projectId: "p1",
        type: "post-copy",
        payload: {
          clipId: "c1",
          title: "Rahasia nabung",
          hook: "Gaji kecil tetap bisa nabung",
          platform: "reels",
          language: "en",
          transcript: "Halo nabung.",
        },
      },
    ]);
  });

  it("bahasa auto dikirim sebagai null (ikut transkrip)", async () => {
    const { start, queued } = setup([]);
    await start.execute("c1", { platform: "tiktok", language: "auto" });
    expect(queued[0]?.payload).toMatchObject({ language: null });
  });

  it("job yang masih berjalan dipakai ulang, tidak mengantre ganda", async () => {
    const running = job("j7", "running", "c1");
    const { start, queued } = setup([running]);
    expect(
      await start.execute("c1", { platform: "tiktok", language: "auto" }),
    ).toEqual({ status: "started", job: running });
    expect(queued).toEqual([]);
  });

  it("job selesai atau gagal tidak menghalangi buat ulang", async () => {
    const { start, queued } = setup([
      job("j8", "done", "c1", { result: copy }),
    ]);
    await start.execute("c1", { platform: "tiktok", language: "auto" });
    expect(queued).toHaveLength(1);
  });

  it("klip tanpa ucapan ditolak tanpa antre; klip tak ada → not_found", async () => {
    const empty = setup([], [{ type: "pause", text: "" }]);
    expect(
      await empty.start.execute("c1", { platform: "tiktok", language: "auto" }),
    ).toMatchObject({ status: "invalid" });
    expect(empty.queued).toEqual([]);
    expect(
      await setup([]).start.execute("x", {
        platform: "tiktok",
        language: "auto",
      }),
    ).toEqual({ status: "not_found" });
  });
});
