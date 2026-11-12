/** Token transkrip seperti yang dipakai editor (struktur sama dengan token di kolom `words`). */
export interface EditorToken {
  id: string;
  type: "word" | "filler" | "pause";
  text: string;
  startMs: number;
  endMs: number;
}

export interface TimeRange {
  startMs: number;
  endMs: number;
}

/**
 * Token yang seluruhnya berada di dalam rentang klip. Dipilih menurut waktu, bukan id, agar
 * klip tetap memetakan ke ucapan yang sama walau transkripsi ulang menggeser id token.
 */
export function tokensInRange<T extends TimeRange>(
  tokens: readonly T[],
  range: TimeRange,
): T[] {
  return tokens.filter(
    (t) => t.startMs >= range.startMs && t.endMs <= range.endMs,
  );
}

/**
 * Sidik token klip (FNV-1a 32-bit atas id, tipe, waktu, teks). Berubah bila transkrip di
 * rentang klip berubah, sehingga EditingScript lama terdeteksi usang.
 */
export function tokensFingerprint(tokens: readonly EditorToken[]): string {
  let hash = 0x811c9dc5;
  const feed = (value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  for (const t of tokens) {
    feed(`${t.id}|${t.type}|${t.startMs}|${t.endMs}|${t.text}\n`);
  }
  return `${tokens.length}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
