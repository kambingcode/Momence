import { describe, expect, it } from "vitest";
import type { ProjectListItem } from "@/modules/projects/application";
import {
  describeProjectCount,
  filterAndSortProjects,
  isProjectSort,
  type ProjectSort,
} from "./filter-sort";

function project(
  id: string,
  overrides: {
    name?: string;
    createdAt?: number;
    count?: number;
    bestScore?: number | null;
    sizeBytes?: number;
  } = {},
): ProjectListItem {
  const createdAt = overrides.createdAt ?? 0;
  return {
    id,
    name: overrides.name ?? id,
    createdAt,
    source: {
      id: `s-${id}`,
      projectId: id,
      originalName: `${id}.mp4`,
      path: `media/${id}/source.mp4`,
      sizeBytes: overrides.sizeBytes ?? 0,
      durationMs: null,
      width: null,
      height: null,
      proxyPath: null,
    },
    jobs: [],
    clips: {
      count: overrides.count ?? 0,
      bestScore: overrides.bestScore ?? null,
    },
    updatedAt: createdAt,
  };
}

const ids = (list: ProjectListItem[]) => list.map((p) => p.id);
const sizeOf = (p: ProjectListItem) => p.source?.sizeBytes ?? 0;

function run(
  projects: ProjectListItem[],
  sort: ProjectSort,
  query = "",
): ProjectListItem[] {
  return filterAndSortProjects(projects, { query, sort, sizeOf });
}

describe("filterAndSortProjects — pencarian", () => {
  const list = [
    project("a", { name: "Podcast Episode 12" }),
    project("b", { name: "Wawancara Founder" }),
    project("c", { name: "podcast Bonus" }),
  ];

  it("mencocokkan judul tanpa membedakan huruf besar/kecil", () => {
    expect(ids(run(list, "name", "PODCAST"))).toEqual(["c", "a"]);
  });

  it("mencocokkan potongan di tengah judul", () => {
    expect(ids(run(list, "name", "wan"))).toEqual(["b"]);
  });

  it("mengabaikan spasi di tepi pencarian", () => {
    expect(ids(run(list, "name", "  founder  "))).toEqual(["b"]);
  });

  it("pencarian kosong atau spasi saja menampilkan semuanya", () => {
    expect(run(list, "name", "")).toHaveLength(3);
    expect(run(list, "name", "   ")).toHaveLength(3);
  });

  it("tanpa kecocokan → daftar kosong", () => {
    expect(run(list, "name", "zzz")).toEqual([]);
  });

  it("tidak menafsirkan karakter khusus regex", () => {
    expect(
      run([project("a", { name: "Tutorial (1)" })], "name", "(1)"),
    ).toHaveLength(1);
    expect(run(list, "name", ".*")).toEqual([]);
  });

  it("tidak mengubah daftar asal", () => {
    const copy = [...list];
    run(list, "name", "podcast");
    expect(list).toEqual(copy);
  });
});

describe("filterAndSortProjects — urutan", () => {
  it("Terbaru: createdAt menurun; Terlama: menaik", () => {
    const list = [
      project("old", { createdAt: 1 }),
      project("new", { createdAt: 3 }),
      project("mid", { createdAt: 2 }),
    ];
    expect(ids(run(list, "newest"))).toEqual(["new", "mid", "old"]);
    expect(ids(run(list, "oldest"))).toEqual(["old", "mid", "new"]);
  });

  it("Nama A–Z: tanpa membedakan huruf dan mengurutkan angka secara numerik", () => {
    const list = [
      project("1", { name: "episode 10" }),
      project("2", { name: "Zebra" }),
      project("3", { name: "Episode 2" }),
      project("4", { name: "apel" }),
    ];
    expect(run(list, "name").map((p) => p.name)).toEqual([
      "apel",
      "Episode 2",
      "episode 10",
      "Zebra",
    ]);
  });

  it("Skor tertinggi: proyek tanpa skor di akhir, skor 0 tetap di atas yang kosong", () => {
    const list = [
      project("none", { createdAt: 9 }),
      project("low", { bestScore: 0, createdAt: 1 }),
      project("high", { bestScore: 96, createdAt: 2 }),
      project("mid", { bestScore: 74, createdAt: 3 }),
    ];
    expect(ids(run(list, "score"))).toEqual(["high", "mid", "low", "none"]);
  });

  it("Klip terbanyak", () => {
    const list = [
      project("a", { count: 1 }),
      project("b", { count: 5 }),
      project("c", { count: 0 }),
    ];
    expect(ids(run(list, "clips"))).toEqual(["b", "a", "c"]);
  });

  it("Ukuran terbesar memakai sizeOf (mis. pemakaian disk)", () => {
    const list = [
      project("a", { sizeBytes: 10 }),
      project("b", { sizeBytes: 300 }),
      project("c", { sizeBytes: 20 }),
    ];
    expect(ids(run(list, "size"))).toEqual(["b", "c", "a"]);
    const disk = new Map([
      ["a", 999],
      ["b", 1],
      ["c", 5],
    ]);
    expect(
      ids(
        filterAndSortProjects(list, {
          query: "",
          sort: "size",
          sizeOf: (p) => disk.get(p.id) ?? 0,
        }),
      ),
    ).toEqual(["a", "c", "b"]);
  });

  it("hasil seri diurutkan Terbaru, lalu menurut urutan asal", () => {
    const list = [
      project("a", { count: 2, createdAt: 1 }),
      project("b", { count: 2, createdAt: 5 }),
      project("c", { count: 2, createdAt: 5 }),
    ];
    expect(ids(run(list, "clips"))).toEqual(["b", "c", "a"]);
  });

  it("pencarian dan urutan bekerja bersama", () => {
    const list = [
      project("a", { name: "Vlog 1", bestScore: 50 }),
      project("b", { name: "Vlog 2", bestScore: 90 }),
      project("c", { name: "Podcast", bestScore: 99 }),
    ];
    expect(ids(run(list, "score", "vlog"))).toEqual(["b", "a"]);
  });
});

describe("isProjectSort", () => {
  it("hanya menerima kunci urutan yang dikenal", () => {
    expect(isProjectSort("score")).toBe(true);
    expect(isProjectSort("toString")).toBe(false);
    expect(isProjectSort("")).toBe(false);
    expect(isProjectSort(null)).toBe(false);
  });
});

describe("describeProjectCount", () => {
  it("semua proyek", () => {
    expect(describeProjectCount({ shown: 3, total: 3, limit: 100 })).toBe(
      "Menampilkan semua 3 proyek",
    );
  });

  it("disaring", () => {
    expect(describeProjectCount({ shown: 1, total: 3, limit: 100 })).toBe(
      "Menampilkan 1 dari 3 proyek",
    );
    expect(describeProjectCount({ shown: 0, total: 3, limit: 100 })).toBe(
      "Menampilkan 0 dari 3 proyek",
    );
  });

  it("menyentuh batas daftar → menyebut proyek terbaru", () => {
    expect(describeProjectCount({ shown: 100, total: 100, limit: 100 })).toBe(
      "Menampilkan 100 proyek terbaru",
    );
    expect(describeProjectCount({ shown: 4, total: 100, limit: 100 })).toBe(
      "Menampilkan 4 dari 100 proyek terbaru",
    );
  });

  it("satu proyek di bawah batas tidak dianggap terpotong", () => {
    expect(describeProjectCount({ shown: 99, total: 99, limit: 100 })).toBe(
      "Menampilkan semua 99 proyek",
    );
  });
});
