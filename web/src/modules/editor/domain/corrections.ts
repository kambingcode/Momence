import type { EditorToken } from "./clip-tokens";

interface Punctuated {
  lead: string;
  core: string;
  trail: string;
}

/** Pisahkan tanda baca di awal/akhir kata: "“Halo,”" → “ + Halo + ,” */
export function splitPunctuation(text: string): Punctuated {
  const match = /^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}]*)$/u.exec(
    text.trim(),
  );
  return {
    lead: match?.[1] ?? "",
    core: match?.[2] ?? "",
    trail: match?.[3] ?? "",
  };
}

/** Kunci pencocokan "Apply to all": huruf kecil, tanpa tanda baca di tepi. */
export const wordKey = (text: string) =>
  splitPunctuation(text).core.toLocaleLowerCase();

/** Indeks kata/filler yang teks aslinya sama dengan token `index` (termasuk dirinya). */
export function matchingWords(
  tokens: readonly EditorToken[],
  index: number,
): number[] {
  const target = tokens[index];
  if (!target || target.type === "pause") return [];
  const key = wordKey(target.text);
  if (!key) return [index];
  const result: number[] = [];
  tokens.forEach((t, i) => {
    if (t.type !== "pause" && wordKey(t.text) === key) result.push(i);
  });
  return result;
}

/**
 * Koreksi untuk "Apply to all": teks baru dipasang di setiap kata yang cocok dengan tanda baca
 * milik kata itu sendiri (bila pengguna tidak menulis tanda baca), mis. "menabung." → "Menabung.".
 * Teks kosong → hapus koreksi semua kata itu.
 */
export function correctionsForAll(
  tokens: readonly EditorToken[],
  index: number,
  text: string,
): Record<string, string | null> {
  const typed = splitPunctuation(text);
  const updates: Record<string, string | null> = {};
  for (const i of matchingWords(tokens, index)) {
    const token = tokens[i]!;
    if (!typed.core) {
      updates[token.id] = null;
      continue;
    }
    const own = splitPunctuation(token.text);
    const lead = typed.lead || own.lead;
    const trail = typed.trail || own.trail;
    updates[token.id] = `${lead}${typed.core}${trail}`;
  }
  return updates;
}
