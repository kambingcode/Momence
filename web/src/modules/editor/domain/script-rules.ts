import type { EditorToken } from "./clip-tokens";

/** Bagian EditingScript yang merujuk token. */
export interface TokenEdits {
  removed: readonly { removalId: string; tokenIds: readonly string[] }[];
  corrections: Readonly<Record<string, string>>;
}

/**
 * Pelanggaran aturan EditingScript terhadap token klip, atau `null` bila valid:
 * token harus ada di klip, satu token hanya di satu grup potongan, `removalId` unik,
 * koreksi hanya untuk kata/filler.
 */
export function tokenEditsProblem(
  edits: TokenEdits,
  tokens: readonly EditorToken[],
): string | null {
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const removalIds = new Set<string>();
  const removedTokens = new Set<string>();
  for (const removal of edits.removed) {
    if (removalIds.has(removal.removalId))
      return `Grup potongan ${removal.removalId} ganda.`;
    removalIds.add(removal.removalId);
    for (const id of removal.tokenIds) {
      if (!byId.has(id)) return `Token ${id} tidak ada di klip ini.`;
      if (removedTokens.has(id))
        return `Token ${id} ada di lebih dari satu grup potongan.`;
      removedTokens.add(id);
    }
  }
  for (const id of Object.keys(edits.corrections)) {
    const token = byId.get(id);
    if (!token) return `Token ${id} tidak ada di klip ini.`;
    if (token.type === "pause") return `Jeda ${id} tidak bisa dikoreksi.`;
  }
  return null;
}
