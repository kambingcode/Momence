import { describe, expect, it } from "vitest";
import { sortClips } from "./order";

const clip = (id: string, rank: number | null, startMs: number) => ({
  id,
  rank,
  startMs,
  endMs: startMs + 30_000,
});

const clips = [
  clip("c", 3, 0),
  clip("lama", null, 5_000),
  clip("a", 1, 60_000),
  clip("b", 2, 30_000),
];

describe("sortClips", () => {
  it("score: peringkat naik, klip tanpa peringkat paling bawah", () => {
    expect(sortClips(clips, "score").map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
      "lama",
    ]);
  });

  it("chronological: urut waktu mulai lalu waktu selesai", () => {
    const sameStart = { ...clip("pendek", 4, 0), endMs: 20_000 };
    expect(
      sortClips([...clips, sameStart], "chronological").map((c) => c.id),
    ).toEqual(["pendek", "c", "lama", "b", "a"]);
  });

  it("tidak mengubah array asal", () => {
    const before = clips.map((c) => c.id);
    sortClips(clips, "score");
    expect(clips.map((c) => c.id)).toEqual(before);
  });
});
