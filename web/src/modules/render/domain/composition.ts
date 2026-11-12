/** Laju frame video hasil, sama untuk pratinjau dan render. */
export const COMPOSITION_FPS = 30;

/** Rasio video hasil (cermin `aspectRatioSchema`). */
export type OutputRatio = "9:16" | "1:1" | "16:9";

/** Ukuran video hasil per rasio: sisi pendek 1080 px. */
export function compositionSize(ratio: OutputRatio): {
  width: number;
  height: number;
} {
  switch (ratio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
      return { width: 1920, height: 1080 };
  }
}

export interface SourceRange {
  startMs: number;
  endMs: number;
}

/** Satu bagian video sumber yang diputar mulai frame `fromFrame` komposisi. */
export interface PlanSequence {
  fromFrame: number;
  durationInFrames: number;
  /** Frame video sumber (pada `fps` komposisi) tempat bagian ini mulai. */
  sourceStartFrame: number;
}

export interface CompositionPlan {
  fps: number;
  durationInFrames: number;
  sequences: PlanSequence[];
}

const toFrame = (ms: number, fps: number) => Math.round((ms * fps) / 1000);

/**
 * Bagian sumber yang dipertahankan (berurutan, dari timeline editor) → urutan sequence
 * komposisi yang bersambung tanpa celah. Yang dibulatkan ke frame adalah posisi kumulatif di
 * komposisi, sehingga durasi total menyimpang ≤ ½ frame dari durasi timeline (galat tidak
 * menumpuk per bagian); bagian yang terlalu pendek untuk satu frame dilewati.
 */
export function compositionPlan(
  segments: readonly SourceRange[],
  fps: number = COMPOSITION_FPS,
): CompositionPlan {
  const sequences: PlanSequence[] = [];
  let elapsedMs = 0;
  for (const segment of segments) {
    const fromFrame = toFrame(elapsedMs, fps);
    elapsedMs += segment.endMs - segment.startMs;
    const durationInFrames = toFrame(elapsedMs, fps) - fromFrame;
    if (durationInFrames <= 0) continue;
    sequences.push({
      fromFrame,
      durationInFrames,
      sourceStartFrame: toFrame(segment.startMs, fps),
    });
  }
  return { fps, durationInFrames: toFrame(elapsedMs, fps), sequences };
}

/** Frame komposisi → posisi video sumber (ms); di luar komposisi → `null`. */
export function frameToSourceMs(
  plan: CompositionPlan,
  frame: number,
): number | null {
  const sequence = plan.sequences.find(
    (s) => frame >= s.fromFrame && frame < s.fromFrame + s.durationInFrames,
  );
  if (!sequence) return null;
  return (
    ((sequence.sourceStartFrame + frame - sequence.fromFrame) * 1000) / plan.fps
  );
}

/**
 * Posisi video sumber (ms) → frame komposisi. Di dalam potongan atau sebelum klip → frame awal
 * bagian berikutnya; setelah bagian terakhir → frame terakhir. Komposisi kosong → 0.
 */
export function sourceMsToFrame(
  plan: CompositionPlan,
  sourceMs: number,
): number {
  // Toleransi float: ms dari `frameToSourceMs` (mis. 1966,666…) kembali ke frame yang sama.
  const sourceFrame = Math.floor((sourceMs * plan.fps) / 1000 + 1e-6);
  for (const s of plan.sequences) {
    if (sourceFrame < s.sourceStartFrame) return s.fromFrame;
    if (sourceFrame < s.sourceStartFrame + s.durationInFrames)
      return s.fromFrame + sourceFrame - s.sourceStartFrame;
  }
  return Math.max(0, plan.durationInFrames - 1);
}

/** Frame pertama yang menampilkan posisi ≥ `sourceMs` (lompat ke awal kata tanpa mendahuluinya). */
export const frameAtOrAfter = (
  plan: CompositionPlan,
  sourceMs: number,
): number => sourceMsToFrame(plan, sourceMs + 1000 / plan.fps - 1e-3);
