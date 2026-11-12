import { describe, expect, it } from "vitest";
import { ListProjectClips } from "./list-project-clips";
import type { Clip, ClipRepository } from "./ports";

const clip = (id: string, projectId: string, rank: number | null): Clip => ({
  id,
  projectId,
  title: id,
  startMs: 0,
  endMs: 30_000,
  score: rank === null ? null : 100 - rank,
  rank,
  details: {
    sourceId: "s1",
    rawScore: 5,
    hook: "",
    startTokenId: "w1",
    endTokenId: "w2",
    keywords: [],
    subscores: {
      hook: { score: 5, comment: "" },
      flow: { score: 5, comment: "" },
      value: { score: 5, comment: "" },
      trend: { score: 5, comment: "" },
    },
  },
});

function repo(clips: Clip[]): ClipRepository {
  return {
    listByProject: async (projectId) =>
      clips.filter((c) => c.projectId === projectId),
    get: async (clipId) => clips.find((c) => c.id === clipId) ?? null,
    summarizeByProject: async () => new Map(),
  };
}

describe("ListProjectClips", () => {
  it("mengembalikan klip proyek itu saja, urut peringkat", async () => {
    const list = new ListProjectClips(
      repo([clip("b", "p1", 2), clip("x", "p2", 1), clip("a", "p1", 1)]),
    );
    expect((await list.execute("p1")).map((c) => c.id)).toEqual(["a", "b"]);
    expect(await list.execute("kosong")).toEqual([]);
  });
});
