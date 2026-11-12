import { type CleanupMatch, type CleanupToken, matchOf } from "./cleanup";

/**
 * Kata pengisi default, sama dengan daftar worker (`transcript/domain/markers.py`) agar jumlah
 * temuan cocok dengan token yang ditandai `filler`. Bentuk ternormalisasi (`fillerKey`).
 * ID: eh, em, ehm, e, m, anu · EN: um, uh, uhm, hm, mhm, ah, er, erm.
 */
export const DEFAULT_FILLER_WORDS: readonly string[] = [
  "eh",
  "em",
  "ehm",
  "e",
  "m",
  "anu",
  "um",
  "uh",
  "uhm",
  "hm",
  "mhm",
  "ah",
  "er",
  "erm",
];

/** Frasa pengisi default (ID & EN); dicocokkan per kata dengan `fillerKey`. */
export const DEFAULT_FILLER_PHRASES: readonly string[] = [
  "apa ya",
  "apa namanya",
  "you know",
  "i mean",
  "kind of",
  "kinda",
  "sort of",
  "sorta",
];

/** Daftar yang bisa diedit pengguna (Settings, T9.1); entri boleh ditulis bebas ("Ummm"). */
export interface FillerConfig {
  words: readonly string[];
  phrases: readonly string[];
}

export const DEFAULT_FILLER_CONFIG: FillerConfig = {
  words: DEFAULT_FILLER_WORDS,
  phrases: DEFAULT_FILLER_PHRASES,
};

/**
 * Cermin `filler_key` worker: huruf kecil, hanya huruf, huruf berulang diringkas:
 * "Ummm," → "um", "Mm-hmm" → "mhm".
 */
export const fillerKey = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\P{L}/gu, "")
    .replace(/(.)\1+/gu, "$1");

/** Kunci kata berulang: huruf kecil, hanya huruf & angka ("Saya," = "saya", "to" ≠ "too"). */
const repeatKey = (text: string): string =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Celah terpanjang di antara dua kata yang masih dihitung sebagai pengulangan. */
export const REPEAT_MAX_GAP_MS = 1500;

/** Kata yang menutup kalimat ("saya." / "ya?”"): kata yang sama setelahnya bukan pengulangan. */
const SENTENCE_END = /[.!?…]["'”’)\]]*$/u;

interface Pattern {
  kind: "filler" | "phrase";
  keys: string[];
}

/** Pola dari daftar, terpanjang dulu agar "apa namanya" menang atas entri yang lebih pendek. */
function patternsOf(config: FillerConfig): Pattern[] {
  const seen = new Set<string>();
  const patterns: Pattern[] = [];
  const lists = [
    ["filler", config.words],
    ["phrase", config.phrases],
  ] as const;
  for (const [kind, entries] of lists) {
    for (const entry of entries) {
      const keys = entry.split(/\s+/).map(fillerKey).filter(Boolean);
      const id = keys.join(" ");
      if (keys.length === 0 || seen.has(id)) continue;
      seen.add(id);
      patterns.push({ kind, keys });
    }
  }
  return patterns.sort((a, b) => b.keys.length - a.keys.length);
}

/**
 * Kata berulang berurutan ("saya saya saya" → dua yang pertama): yang terakhir dipertahankan.
 * Jeda & token di `skip` (filler) boleh di antaranya; kata lain, akhir kalimat, atau celah
 * > `REPEAT_MAX_GAP_MS` memutus pengulangan.
 */
function repeatedWords(
  tokens: readonly CleanupToken[],
  skip: ReadonlySet<number>,
): CleanupMatch[] {
  const matches: CleanupMatch[] = [];
  let run: CleanupToken[] = [];
  let runKey = "";
  const flush = () => {
    if (run.length > 1)
      matches.push(matchOf("repeated", run.slice(0, -1), runKey));
    run = [];
  };
  tokens.forEach((token, i) => {
    if (token.type === "pause" || skip.has(i)) return;
    const key = repeatKey(token.text);
    const last = run.at(-1);
    const continues =
      last !== undefined &&
      key === runKey &&
      token.startMs - last.endMs <= REPEAT_MAX_GAP_MS &&
      !SENTENCE_END.test(last.text);
    if (!continues) flush();
    if (key === "") return;
    run.push(token);
    runKey = key;
  });
  flush();
  return matches;
}

/**
 * Kata & frasa pengisi serta kata berulang di `tokens` (berurutan). Berikan hanya token yang
 * masih dipertahankan, agar temuan mengikuti ucapan setelah potongan. Dicocokkan dengan teks
 * asli (bukan koreksi) dan daftar `config` saja, bukan `type` dari worker, sehingga entri yang
 * dihapus dari daftar tidak terdeteksi lagi. Jeda dan akhir kalimat memutus frasa ("kind. Of"
 * bukan "kind of"). Satu token paling banyak di satu temuan; hasil urut waktu.
 */
export function detectFillers(
  tokens: readonly CleanupToken[],
  config: FillerConfig = DEFAULT_FILLER_CONFIG,
): CleanupMatch[] {
  const patterns = patternsOf(config);
  const keys = tokens.map((t) => (t.type === "pause" ? "" : fillerKey(t.text)));
  const matches: CleanupMatch[] = [];
  const claimed = new Set<number>();
  let i = 0;
  while (i < tokens.length) {
    const pattern = patterns.find((p) =>
      p.keys.every(
        (key, j) =>
          keys[i + j] === key &&
          (j === p.keys.length - 1 || !SENTENCE_END.test(tokens[i + j]!.text)),
      ),
    );
    if (!pattern) {
      i += 1;
      continue;
    }
    const length = pattern.keys.length;
    matches.push(
      matchOf(
        pattern.kind,
        tokens.slice(i, i + length),
        pattern.keys.join(" "),
      ),
    );
    for (let j = i; j < i + length; j += 1) claimed.add(j);
    i += length;
  }
  matches.push(...repeatedWords(tokens, claimed));
  return matches.sort((a, b) => a.startMs - b.startMs);
}
