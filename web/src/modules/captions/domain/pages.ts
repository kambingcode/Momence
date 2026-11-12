import type { PageRules } from "./style";

/** Token transkrip minimal (waktu di video sumber). */
export interface CaptionToken {
  id: string;
  type: "word" | "filler" | "pause";
  text: string;
  startMs: number;
  endMs: number;
}

/** Kata caption; waktu di klip setelah potongan. */
export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
  keyword: boolean;
}

/** Teks yang tampil bersamaan, dari `startMs` sampai `endMs` (waktu klip). */
export interface CaptionPage {
  startMs: number;
  endMs: number;
  words: CaptionWord[];
}

/** Jeda ucapan sepanjang ini memulai halaman baru. */
export const PAGE_GAP_MS = 600;
/** Halaman tetap tampil sekian lama setelah kata terakhirnya (kecuali halaman berikutnya mulai). */
export const PAGE_LINGER_MS = 500;

const SENTENCE_END = /[.!?…]["'”’)\]]*$/u;

/** Cermin `keyword_key` worker: huruf kecil, tanpa tanda baca di tepi. */
export const keywordKey = (text: string): string =>
  text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();

export interface CaptionSource {
  /** Token klip, berurutan. */
  tokens: readonly CaptionToken[];
  removedIds: ReadonlySet<string>;
  /** Teks pengganti per token (koreksi editor). */
  corrections: Readonly<Record<string, string>>;
  /** Kunci kata kunci (`keywordKey`). */
  keywords: readonly string[];
  /** Waktu sumber → waktu klip setelah potongan. */
  toClipMs: (sourceMs: number) => number;
}

/**
 * Kata & filler yang dipertahankan, dengan teks koreksi dan waktu klip. Kata kunci dicocokkan
 * dengan teks asli, sehingga sorotan tetap ada walau ejaannya dikoreksi.
 */
export function captionWords(source: CaptionSource): CaptionWord[] {
  const keywords = new Set(source.keywords);
  const words: CaptionWord[] = [];
  for (const token of source.tokens) {
    if (token.type === "pause" || source.removedIds.has(token.id)) continue;
    const text = (source.corrections[token.id] ?? token.text).trim();
    const startMs = source.toClipMs(token.startMs);
    const endMs = source.toClipMs(token.endMs);
    if (!text || endMs <= startMs) continue;
    words.push({
      text,
      startMs,
      endMs,
      keyword: keywords.has(keywordKey(token.text)),
    });
  }
  return words;
}

/**
 * Kelompokkan kata menjadi halaman: halaman baru bila batas kata/karakter preset terlampaui,
 * kata sebelumnya menutup kalimat, atau ada jeda > `PAGE_GAP_MS`. Kata yang lebih panjang dari
 * `maxChars` tetap mendapat halaman sendiri.
 */
export function captionPages(
  words: readonly CaptionWord[],
  rules: PageRules,
  durationMs: number,
): CaptionPage[] {
  const groups: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  let chars = 0;
  for (const word of words) {
    const last = current.at(-1);
    const breaks =
      last !== undefined &&
      (current.length >= rules.maxWords ||
        chars + 1 + word.text.length > rules.maxChars ||
        SENTENCE_END.test(last.text) ||
        word.startMs - last.endMs > PAGE_GAP_MS);
    if (breaks) {
      groups.push(current);
      current = [];
      chars = 0;
    }
    chars += (current.length > 0 ? 1 : 0) + word.text.length;
    current.push(word);
  }
  if (current.length > 0) groups.push(current);

  return groups.map((group, i) => {
    const lingerEnd = Math.min(
      group.at(-1)!.endMs + PAGE_LINGER_MS,
      durationMs,
    );
    const next = groups[i + 1];
    return {
      startMs: group[0]!.startMs,
      endMs: next ? Math.min(next[0]!.startMs, lingerEnd) : lingerEnd,
      words: group,
    };
  });
}
