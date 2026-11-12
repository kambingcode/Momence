import type { ProjectListItem } from "@/modules/projects/application";

export type ProjectSort =
  "newest" | "oldest" | "name" | "score" | "clips" | "size";

export const DEFAULT_SORT: ProjectSort = "newest";

export const SORT_LABELS: Record<ProjectSort, string> = {
  newest: "Terbaru",
  oldest: "Terlama",
  name: "Nama A–Z",
  score: "Skor tertinggi",
  clips: "Klip terbanyak",
  size: "Ukuran terbesar",
};

export function isProjectSort(value: unknown): value is ProjectSort {
  return typeof value === "string" && Object.hasOwn(SORT_LABELS, value);
}

const byName = new Intl.Collator("id", { sensitivity: "base", numeric: true });

/** Urutan menurun dengan nilai kosong (`null`) di akhir. */
function descending(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

type Comparator = (
  a: ProjectListItem,
  b: ProjectListItem,
  sizeOf: (project: ProjectListItem) => number,
) => number;

const COMPARATORS: Record<ProjectSort, Comparator> = {
  newest: (a, b) => b.createdAt - a.createdAt,
  oldest: (a, b) => a.createdAt - b.createdAt,
  name: (a, b) => byName.compare(a.name, b.name),
  score: (a, b) => descending(a.clips.bestScore, b.clips.bestScore),
  clips: (a, b) => b.clips.count - a.clips.count,
  size: (a, b, sizeOf) => sizeOf(b) - sizeOf(a),
};

/**
 * Saring menurut judul (tanpa membedakan huruf; spasi di tepi diabaikan) lalu urutkan. Hasil
 * seri diurutkan Terbaru, lalu menurut urutan asal, supaya daftar tidak melompat saat polling.
 * Daftar asal tidak diubah.
 */
export function filterAndSortProjects(
  projects: readonly ProjectListItem[],
  {
    query,
    sort,
    sizeOf,
  }: {
    query: string;
    sort: ProjectSort;
    /** Ukuran proyek di disk, untuk urutan "Ukuran terbesar". */
    sizeOf: (project: ProjectListItem) => number;
  },
): ProjectListItem[] {
  const needle = query.trim().toLocaleLowerCase("id");
  const matching = needle
    ? projects.filter((p) => p.name.toLocaleLowerCase("id").includes(needle))
    : [...projects];
  const compare = COMPARATORS[sort];
  return matching
    .map((project, index) => ({ project, index }))
    .sort(
      (a, b) =>
        compare(a.project, b.project, sizeOf) ||
        b.project.createdAt - a.project.createdAt ||
        a.index - b.index,
    )
    .map(({ project }) => project);
}

/**
 * Keterangan jumlah di footer daftar: "semua N proyek", "M dari N proyek" saat disaring, dan
 * "… proyek terbaru" bila daftar terpotong oleh batas `limit` (ada proyek lama yang tak tampil).
 */
export function describeProjectCount({
  shown,
  total,
  limit,
}: {
  shown: number;
  total: number;
  limit: number;
}): string {
  const truncated = total >= limit;
  const noun = truncated ? `${total} proyek terbaru` : `${total} proyek`;
  if (shown < total) return `Menampilkan ${shown} dari ${noun}`;
  return truncated ? `Menampilkan ${noun}` : `Menampilkan semua ${noun}`;
}
