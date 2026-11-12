import type { CompositionPlan } from "./composition";

/** B-roll terpasang (bentuk item `broll[]` EditingScript yang dibutuhkan komposisi). */
export interface BrollSource {
  /** Rentang di video sumber (ms). */
  startMs: number;
  endMs: number;
  /** Durasi video stok; 0 = tidak diketahui (tidak diputar ulang). */
  durationMs: number;
  /** File resolusi render & file kecil untuk pratinjau editor. */
  url: string;
  previewUrl: string;
}

/** Satu potongan B-roll di komposisi: video stok mulai frame `trimBeforeFrames`. */
export interface BrollSequence {
  fromFrame: number;
  durationInFrames: number;
  trimBeforeFrames: number;
  url: string;
  previewUrl: string;
}

const toFrame = (ms: number, fps: number) => Math.round((ms * fps) / 1000);

/**
 * B-roll → sequence komposisi. Hanya bagian rentangnya yang masih diputar (sequence `plan`)
 * yang tampil; posisi di video stok berlanjut melintasi potongan, dan video stok yang lebih
 * pendek dari rentangnya diputar ulang dari awal (dipecah per putaran). Potongan yang bersambung
 * di komposisi & di video stok digabung agar video tidak dimuat ulang.
 */
export function brollSequences(
  plan: CompositionPlan,
  items: readonly BrollSource[],
): BrollSequence[] {
  const { fps } = plan;
  const result: BrollSequence[] = [];
  for (const item of items) {
    const start = toFrame(item.startMs, fps);
    const end = toFrame(item.endMs, fps);
    const loopFrames = toFrame(item.durationMs, fps);
    let played = 0;
    for (const s of plan.sequences) {
      const from = Math.max(start, s.sourceStartFrame);
      const to = Math.min(end, s.sourceStartFrame + s.durationInFrames);
      let frame = s.fromFrame + from - s.sourceStartFrame;
      let remaining = to - from;
      while (remaining > 0) {
        const offset = loopFrames > 0 ? played % loopFrames : played;
        const take =
          loopFrames > 0 ? Math.min(remaining, loopFrames - offset) : remaining;
        const last = result.at(-1);
        if (
          last?.url === item.url &&
          last.fromFrame + last.durationInFrames === frame &&
          last.trimBeforeFrames + last.durationInFrames === offset
        )
          last.durationInFrames += take;
        else
          result.push({
            fromFrame: frame,
            durationInFrames: take,
            trimBeforeFrames: offset,
            url: item.url,
            previewUrl: item.previewUrl,
          });
        frame += take;
        played += take;
        remaining -= take;
      }
    }
  }
  return result.sort((a, b) => a.fromFrame - b.fromFrame);
}
