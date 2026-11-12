import { describe, expect, it } from "vitest";
import { DeleteProject } from "./delete-project";
import type { ProjectDeletion } from "./ports";

function setup(outcome: ProjectDeletion, online: boolean) {
  const calls: { allowRunning: boolean }[] = [];
  const removed: string[] = [];
  const remove = new DeleteProject(
    {
      deleteIfIdle: async (_id, options) => {
        calls.push(options);
        return outcome;
      },
    },
    { removeProject: async (id) => void removed.push(id) },
    { isOnline: async () => online },
  );
  return { remove, calls, removed };
}

describe("DeleteProject", () => {
  it("menghapus baris lalu folder media proyek", async () => {
    const { remove, calls, removed } = setup({ status: "deleted" }, true);
    expect(await remove.execute("p1")).toEqual({ status: "deleted" });
    expect(calls).toEqual([{ allowRunning: false }]);
    expect(removed).toEqual(["p1"]);
  });

  it("tidak menyentuh file bila worker sedang mengerjakan job proyek", async () => {
    const busy = { status: "busy", jobType: "render" } as const;
    const { remove, removed } = setup(busy, true);
    expect(await remove.execute("p1")).toEqual(busy);
    expect(removed).toEqual([]);
  });

  it("job running dianggap ditinggalkan bila worker tidak berdetak", async () => {
    const { remove, calls, removed } = setup({ status: "deleted" }, false);
    await remove.execute("p1");
    expect(calls).toEqual([{ allowRunning: true }]);
    expect(removed).toEqual(["p1"]);
  });

  it("proyek tidak ada → folder tidak dihapus (bisa milik unggahan yang berjalan)", async () => {
    const { remove, removed } = setup({ status: "not_found" }, true);
    expect(await remove.execute("p1")).toEqual({ status: "not_found" });
    expect(removed).toEqual([]);
  });
});
