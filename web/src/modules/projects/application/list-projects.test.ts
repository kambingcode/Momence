import { describe, expect, it } from "vitest";
import type { Job } from "@/modules/jobs/application";
import { ListProjects } from "./list-projects";
import type { ProjectRepository, ProjectWithSource } from "./ports";

const project = (id: string, createdAt = 0): ProjectWithSource => ({
  id,
  name: id,
  createdAt,
  source: null,
});

const repo = (projects: ProjectWithSource[]): ProjectRepository => ({
  create: async () => {},
  delete: async () => {},
  deleteIfIdle: async () => ({ status: "deleted" }),
  get: async () => null,
  list: async () => projects,
});

const job = (id: string, type: string, updatedAt: number) =>
  ({ id, type, updatedAt }) as Job;

const noClips = { execute: async () => new Map() };

describe("ListProjects", () => {
  it("menggabungkan proyek dengan job terbarunya", async () => {
    const ingest = job("j1", "ingest", 0);
    let askedFor: readonly string[] = [];
    const list = new ListProjects(
      repo([project("a"), project("b")]),
      {
        execute: async (ids) => {
          askedFor = ids;
          return new Map([["a", [ingest]]]);
        },
      },
      noClips,
    );

    const result = await list.execute();
    expect(askedFor).toEqual(["a", "b"]);
    expect(result.map((p) => [p.id, p.jobs])).toEqual([
      ["a", [ingest]],
      ["b", []],
    ]);
  });

  it("menambahkan statistik klip; proyek tanpa klip = 0 klip tanpa skor", async () => {
    let askedFor: readonly string[] = [];
    const list = new ListProjects(
      repo([project("a"), project("b")]),
      { execute: async () => new Map() },
      {
        execute: async (ids) => {
          askedFor = ids;
          return new Map([["a", { count: 11, bestScore: 89 }]]);
        },
      },
    );

    const result = await list.execute();
    expect(askedFor).toEqual(["a", "b"]);
    expect(result.map((p) => [p.id, p.clips])).toEqual([
      ["a", { count: 11, bestScore: 89 }],
      ["b", { count: 0, bestScore: null }],
    ]);
  });

  it("updatedAt = perubahan job terbaru, atau waktu dibuat bila belum ada job", async () => {
    const list = new ListProjects(
      repo([project("a", 1_000), project("b", 5_000)]),
      {
        execute: async () =>
          new Map([
            ["a", [job("j1", "ingest", 2_000), job("j2", "transcribe", 9_000)]],
          ]),
      },
      noClips,
    );

    const result = await list.execute();
    expect(result.map((p) => [p.id, p.updatedAt])).toEqual([
      ["a", 9_000],
      ["b", 5_000],
    ]);
  });
});
