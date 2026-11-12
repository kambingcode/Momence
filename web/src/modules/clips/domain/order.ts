export type ClipOrder = "score" | "chronological";

interface Orderable {
  /** 1 = terbaik; `null` untuk klip lama yang belum diberi peringkat. */
  rank: number | null;
  startMs: number;
  endMs: number;
}

const chronological = (a: Orderable, b: Orderable) =>
  a.startMs - b.startMs || a.endMs - b.endMs;

/** "score": peringkat 1 dulu (tanpa peringkat paling bawah); "chronological": urut waktu. */
export function sortClips<T extends Orderable>(
  clips: readonly T[],
  order: ClipOrder,
): T[] {
  if (order === "chronological") return clips.toSorted(chronological);
  return clips.toSorted(
    (a, b) =>
      (a.rank ?? Number.POSITIVE_INFINITY) -
        (b.rank ?? Number.POSITIVE_INFINITY) || chronological(a, b),
  );
}
