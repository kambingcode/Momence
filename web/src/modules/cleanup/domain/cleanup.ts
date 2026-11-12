/** Token transkrip minimal untuk deteksi (struktur sama dengan token di kolom `words`). */
export interface CleanupToken {
  id: string;
  type: "word" | "filler" | "pause";
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Jenis temuan speech cleanup: kata pengisi (`filler`), frasa pengisi (`phrase`), kata yang
 * diulang berurutan (`repeated`), dan jeda (`pause`).
 */
export type CleanupKind = "filler" | "phrase" | "repeated" | "pause";

/** Satu temuan = satu grup potongan bila dihapus. */
export interface CleanupMatch {
  kind: CleanupKind;
  /** Token yang dipotong, berurutan. */
  tokenIds: string[];
  /** Rentang di video sumber, dari awal token pertama sampai akhir token terakhir. */
  startMs: number;
  endMs: number;
  /** Bentuk ternormalisasi yang cocok ("um", "you know", "saya"); kosong untuk jeda. */
  key: string;
}

export function matchOf(
  kind: CleanupKind,
  tokens: readonly CleanupToken[],
  key: string,
): CleanupMatch {
  return {
    kind,
    tokenIds: tokens.map((t) => t.id),
    startMs: tokens[0]!.startMs,
    endMs: tokens.at(-1)!.endMs,
    key,
  };
}
