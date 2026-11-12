import type { CompositionPlan } from "./composition";

/** Rentang teks di video sumber (ms); sisa field (isi & gaya) diteruskan apa adanya. */
export interface TextSource {
  startMs: number;
  endMs: number;
}

/** Teks tampil di komposisi selama `durationInFrames` mulai frame `fromFrame`. */
export interface TextSequence<T> {
  fromFrame: number;
  durationInFrames: number;
  overlay: T;
}

const toFrame = (ms: number, fps: number) => Math.round((ms * fps) / 1000);

/**
 * Teks → sequence komposisi. Hanya bagian rentangnya yang masih diputar (sequence `plan`) yang
 * tampil; bagian yang bersambung di komposisi (melintasi potongan) digabung jadi satu sequence,
 * dan teks yang seluruhnya terpotong tidak menghasilkan apa pun. Urutan `items` dipertahankan
 * (urutan tumpuk); `overlay` = item tanpa rentang waktunya.
 */
export function textSequences<T extends TextSource>(
  plan: CompositionPlan,
  items: readonly T[],
): TextSequence<Omit<T, "startMs" | "endMs">>[] {
  const { fps } = plan;
  const result: TextSequence<Omit<T, "startMs" | "endMs">>[] = [];
  for (const { startMs, endMs, ...overlay } of items) {
    const start = toFrame(startMs, fps);
    const end = toFrame(endMs, fps);
    let last: TextSequence<Omit<T, "startMs" | "endMs">> | null = null;
    for (const s of plan.sequences) {
      const from = Math.max(start, s.sourceStartFrame);
      const to = Math.min(end, s.sourceStartFrame + s.durationInFrames);
      if (to <= from) continue;
      const frame = s.fromFrame + from - s.sourceStartFrame;
      if (last && last.fromFrame + last.durationInFrames === frame)
        last.durationInFrames += to - from;
      else {
        last = { fromFrame: frame, durationInFrames: to - from, overlay };
        result.push(last);
      }
    }
  }
  return result;
}

/**
 * Id teks yang tampil pada `frame` komposisi (urutan tumpuk, tanpa ganda); isi kosong tidak
 * digambar sehingga tidak dihitung.
 */
export function visibleTextIds<T extends { id: string; text: string }>(
  sequences: readonly TextSequence<T>[],
  frame: number,
): string[] {
  const ids = sequences
    .filter(
      (s) =>
        frame >= s.fromFrame &&
        frame < s.fromFrame + s.durationInFrames &&
        s.overlay.text.trim() !== "",
    )
    .map((s) => s.overlay.id);
  return [...new Set(ids)];
}
