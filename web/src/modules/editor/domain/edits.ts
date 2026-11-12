export type RemovalKind = "manual" | "filler" | "pause";

export interface RemovalGroup {
  removalId: string;
  tokenIds: string[];
  kind: RemovalKind;
}

export function removedIdSet(
  removed: readonly { tokenIds: readonly string[] }[],
): Set<string> {
  return new Set(removed.flatMap((r) => r.tokenIds));
}

/**
 * Tambah grup potongan berisi token `tokenIds` yang belum terpotong (urutan dipertahankan).
 * Semua sudah terpotong → daftar dikembalikan apa adanya (referensi sama).
 */
export function addRemoval(
  removed: readonly RemovalGroup[],
  tokenIds: readonly string[],
  removalId: string,
  kind: RemovalKind,
): readonly RemovalGroup[] {
  const already = removedIdSet(removed);
  const fresh = [...new Set(tokenIds)].filter((id) => !already.has(id));
  if (fresh.length === 0) return removed;
  return [...removed, { removalId, tokenIds: fresh, kind }];
}

/** Pulihkan satu grup potongan utuh. */
export function restoreRemoval(
  removed: readonly RemovalGroup[],
  removalId: string,
): readonly RemovalGroup[] {
  const next = removed.filter((r) => r.removalId !== removalId);
  return next.length === removed.length ? removed : next;
}

/** Grup yang memuat token `tokenId`, bila ada. */
export function removalOf(
  removed: readonly RemovalGroup[],
  tokenId: string,
): RemovalGroup | undefined {
  return removed.find((r) => r.tokenIds.includes(tokenId));
}

/** Pulihkan semua grup yang memuat salah satu `tokenIds` (grup utuh, bukan token saja). */
export function restoreTouching(
  removed: readonly RemovalGroup[],
  tokenIds: readonly string[],
): readonly RemovalGroup[] {
  const ids = new Set(tokenIds);
  const next = removed.filter((r) => !r.tokenIds.some((id) => ids.has(id)));
  return next.length === removed.length ? removed : next;
}

/**
 * Terapkan koreksi teks caption: `null` atau teks yang sama dengan aslinya menghapus koreksi.
 * Tanpa perubahan → objek yang sama.
 */
export function applyCorrections(
  corrections: Readonly<Record<string, string>>,
  updates: Readonly<Record<string, string | null>>,
  originalText: (tokenId: string) => string | undefined,
): Readonly<Record<string, string>> {
  const next: Record<string, string> = { ...corrections };
  let changed = false;
  for (const [id, text] of Object.entries(updates)) {
    const value = text === null ? null : text.trim();
    if (value === null || value === "" || value === originalText(id)) {
      if (id in next) {
        delete next[id];
        changed = true;
      }
    } else if (next[id] !== value) {
      next[id] = value;
      changed = true;
    }
  }
  return changed ? next : corrections;
}
