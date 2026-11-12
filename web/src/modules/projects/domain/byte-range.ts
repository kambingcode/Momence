/** Rentang byte inklusif [start, end] dari sebuah file. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Header `Range` (RFC 9110) untuk file berukuran `size` byte:
 * - `null` → kirim seluruh file (header kosong, bukan `bytes=`, atau multi-rentang yang tidak didukung);
 * - `"unsatisfiable"` → 416 (rentang di luar file).
 * Bentuk yang didukung: `bytes=a-b`, `bytes=a-`, `bytes=-n` (n byte terakhir).
 */
export function parseByteRange(
  header: string | null | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  if (size === 0) return "unsatisfiable";

  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}
