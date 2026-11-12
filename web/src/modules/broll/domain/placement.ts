interface Range {
  startMs: number;
  endMs: number;
}

const overlaps = (a: Range, b: Range) =>
  a.startMs < b.endMs && b.startMs < a.endMs;

/**
 * Pasang B-roll: item lain yang tumpang-tindih dengan rentangnya diganti (satu video stok per
 * waktu). Hasil terurut menurut waktu mulai.
 */
export function placeBroll<T extends Range>(items: readonly T[], item: T): T[] {
  return [...items.filter((other) => !overlaps(other, item)), item].sort(
    (a, b) => a.startMs - b.startMs,
  );
}

/** Lepas B-roll yang mulai di `startMs`. */
export function removeBrollAt<T extends Range>(
  items: readonly T[],
  startMs: number,
): T[] {
  return items.filter((item) => item.startMs !== startMs);
}

export interface BrollRow<S extends Range, T extends Range> {
  /** Rentang baris: slot usulan, atau B-roll terpasang tanpa slot. */
  range: Range;
  slot: S | null;
  item: T | null;
}

/**
 * Baris panel B-roll: setiap slot usulan (dengan B-roll yang menimpanya, bila ada), ditambah
 * B-roll terpasang yang tidak cocok dengan slot mana pun (dipasang manual / dari rencana lama).
 * Terurut menurut waktu.
 */
export function brollRows<S extends Range, T extends Range>(
  slots: readonly S[],
  items: readonly T[],
): BrollRow<S, T>[] {
  const used = new Set<T>();
  const rows: BrollRow<S, T>[] = slots.map((slot) => {
    const item = items.find((i) => !used.has(i) && overlaps(i, slot)) ?? null;
    if (item) used.add(item);
    return { range: item ?? slot, slot, item };
  });
  for (const item of items)
    if (!used.has(item)) rows.push({ range: item, slot: null, item });
  return rows.sort((a, b) => a.range.startMs - b.range.startMs);
}

/**
 * Rentang B-roll manual mulai `sourceMs` (posisi pratinjau, bisa pecahan ms → dibulatkan):
 * `lengthMs`, tidak melewati akhir klip.
 */
export function manualRange(
  sourceMs: number,
  clipEndMs: number,
  lengthMs: number,
): Range | null {
  const startMs = Math.round(sourceMs);
  const endMs = Math.min(startMs + lengthMs, clipEndMs);
  return endMs > startMs ? { startMs, endMs } : null;
}
