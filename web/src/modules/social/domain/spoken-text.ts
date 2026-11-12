/** Token transkrip (bentuk `transcriptTokenSchema`, cukup bagian yang dipakai di sini). */
export interface SpokenToken {
  type: "word" | "filler" | "pause";
  text: string;
}

/** Batas teks yang dikirim ke Gemini; klip normal (≤ beberapa menit) jauh di bawahnya. */
export const MAX_SPOKEN_CHARS = 12_000;

/**
 * Ucapan klip sebagai satu paragraf untuk bahan caption: hanya kata (filler & jeda dibuang),
 * dipotong di batas kata bila lebih dari `MAX_SPOKEN_CHARS`.
 */
export function spokenText(tokens: readonly SpokenToken[]): string {
  const words: string[] = [];
  let length = 0;
  for (const token of tokens) {
    const text = token.text.trim();
    if (token.type !== "word" || text === "") continue;
    const next = length + (words.length > 0 ? 1 : 0) + text.length;
    if (next > MAX_SPOKEN_CHARS) break;
    words.push(text);
    length = next;
  }
  return words.join(" ");
}
