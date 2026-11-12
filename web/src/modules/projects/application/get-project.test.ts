import { describe, expect, it } from "vitest";
import type { Job } from "@/modules/jobs/application";
import { GetProject } from "./get-project";
import type { ProjectRepository, ProjectWithSource } from "./ports";

const project: ProjectWithSource = {
  id: "p1",
  name: "Video",
  createdAt: 0,
  source: null,
};

function repo(found: ProjectWithSource | null): ProjectRepository {
  return {
    create: async () => {},
    delete: async () => {},
    deleteIfIdle: async () => ({ status: "deleted" }),
    get: async (id) => (found?.id === id ? found : null),
    list: async () => [],
  };
}

describe("GetProject", () => {
  it("menggabungkan proyek dengan job terbarunya", async () => {
    const transcribe = { id: "j2", type: "transcribe" } as Job;
    const get = new GetProject(repo(project), {
      execute: async (ids) => new Map([[ids[0], [transcribe]]]),
    });
    expect(await get.execute("p1")).toEqual({ ...project, jobs: [transcribe] });
  });

  it("null bila proyek tidak ada (tanpa mengambil job)", async () => {
    let asked = false;
    const get = new GetProject(repo(null), {
      execute: async () => {
        asked = true;
        return new Map();
      },
    });
    expect(await get.execute("hilang")).toBeNull();
    expect(asked).toBe(false);
  });
});
