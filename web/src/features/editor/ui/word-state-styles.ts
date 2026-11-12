/**
 * Gaya tiap keadaan kata di transkrip — satu sumber untuk teks (`TranscriptEditor`) dan legenda
 * (`TranscriptLegend`), sehingga keduanya tidak bisa berbeda. Keadaan dibedakan oleh bentuk
 * (isi, blok, coret, titik, gelombang, bingkai), bukan warna (TASKS.md → Tahap 14, keputusan 2).
 */
export type WordState =
  "finding" | "active" | "selected" | "removed" | "corrected" | "filler";

export const WORD_STATE_CLASS: Record<WordState, string> = {
  /** Temuan Speech cleanup yang sedang dinavigasi: bingkai charcoal + latar bone. */
  finding: "bg-secondary outline outline-1 -outline-offset-1 outline-primary",
  /** Kata yang sedang diputar: isi charcoal solid. */
  active: "rounded-xs bg-primary text-primary-foreground",
  /** Seleksi: blok menyambung berlatar lavender + garis bawah charcoal 2px. */
  selected:
    "rounded-none bg-primary-soft text-primary-soft-foreground shadow-[inset_0_-2px_0_0_var(--color-primary)]",
  removed:
    "bg-secondary text-muted-foreground line-through decoration-muted-foreground decoration-2",
  corrected:
    "underline decoration-primary decoration-dotted decoration-2 underline-offset-4",
  filler: "underline decoration-primary decoration-wavy underline-offset-4",
};

export type WordFlags = Record<WordState, boolean>;

/** Urutan prioritas bila beberapa keadaan bertumpuk (yang pertama menang). */
const PRIORITY: readonly WordState[] = [
  "finding",
  "active",
  "selected",
  "removed",
  "corrected",
  "filler",
];

/** Keadaan yang digambar untuk satu kata, atau `null` bila polos. */
export const pickWordState = (flags: WordFlags): WordState | null =>
  PRIORITY.find((state) => flags[state]) ?? null;
