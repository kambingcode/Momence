import type { EditorToken, TimeRange } from "./clip-tokens";
import type { Timeline } from "./timeline";

/** Satu blok di peta klip, dalam persen lebar klip asli (sebelum potongan). */
export interface MapBlock {
  leftPct: number;
  widthPct: number;
}

export interface MapToken extends MapBlock {
  kind: "word" | "filler" | "pause";
}

export interface RulerTick {
  /** Offset dari awal klip (ms). */
  ms: number;
  leftPct: number;
}

export interface ClipMapLayout {
  /** Durasi klip asli (ms); sumbu peta. */
  durationMs: number;
  /** Token yang masih dipertahankan (yang terpotong digambar sebagai `cuts`). */
  tokens: MapToken[];
  /** Bagian yang terpotong (arsiran). */
  cuts: MapBlock[];
  broll: MapBlock[];
  ticks: RulerTick[];
}

const clampPct = (value: number) => Math.min(100, Math.max(0, value));

/** Posisi waktu sumber dalam persen sumbu klip (dijepit 0–100); klip kosong → 0. */
export function percentOf(range: TimeRange, sourceMs: number): number {
  const length = range.endMs - range.startMs;
  return length > 0 ? clampPct(((sourceMs - range.startMs) / length) * 100) : 0;
}

/** Kebalikan `percentOf`: persen sumbu (dijepit 0–100) → waktu sumber. */
export function sourceMsAtPercent(range: TimeRange, pct: number): number {
  return Math.round(
    range.startMs + (clampPct(pct) / 100) * (range.endMs - range.startMs),
  );
}

function blockOf(
  range: TimeRange,
  startMs: number,
  endMs: number,
): MapBlock | null {
  const left = percentOf(range, startMs);
  const right = percentOf(range, endMs);
  return right > left ? { leftPct: left, widthPct: right - left } : null;
}

const TICK_STEPS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** Penggaris waktu: langkah terkecil yang menghasilkan paling banyak `maxTicks` tanda. */
export function rulerTicks(durationMs: number, maxTicks = 8): RulerTick[] {
  if (durationMs <= 0) return [];
  const stepS =
    TICK_STEPS_S.find((s) => durationMs / (s * 1000) < maxTicks) ??
    TICK_STEPS_S.at(-1)!;
  const ticks: RulerTick[] = [];
  for (let ms = 0; ms < durationMs; ms += stepS * 1000)
    ticks.push({ ms, leftPct: (ms / durationMs) * 100 });
  return ticks;
}

/**
 * Tata letak peta klip: sumbu = klip asli; potongan = komplemen `timeline.segments` di dalam
 * klip (jadi celah di antara token ikut terhitung); token yang titik tengahnya di dalam potongan
 * tidak digambar lagi; B-roll dijepit ke klip.
 */
export function layoutClipMap(input: {
  tokens: readonly EditorToken[];
  timeline: Timeline;
  range: TimeRange;
  broll: readonly TimeRange[];
}): ClipMapLayout {
  const { tokens, timeline, range, broll } = input;
  const durationMs = Math.max(0, range.endMs - range.startMs);

  const cuts: MapBlock[] = [];
  const cutRanges: TimeRange[] = [];
  let cursor = range.startMs;
  for (const segment of timeline.segments) {
    if (segment.startMs > cursor)
      cutRanges.push({ startMs: cursor, endMs: segment.startMs });
    cursor = Math.max(cursor, segment.endMs);
  }
  if (cursor < range.endMs)
    cutRanges.push({ startMs: cursor, endMs: range.endMs });
  for (const cut of cutRanges) {
    const block = blockOf(range, cut.startMs, cut.endMs);
    if (block) cuts.push(block);
  }

  // Potongan berhenti `SPEECH_MARGIN_MS` sebelum kata berikutnya, jadi token terpotong dikenali
  // dari titik tengahnya yang ada di dalam potongan.
  const inCut = (token: EditorToken) => {
    const middle = (token.startMs + token.endMs) / 2;
    return cutRanges.some((cut) => middle >= cut.startMs && middle < cut.endMs);
  };
  const mapTokens: MapToken[] = [];
  for (const token of tokens) {
    if (inCut(token)) continue;
    const block = blockOf(range, token.startMs, token.endMs);
    if (block)
      mapTokens.push({
        kind:
          token.type === "pause"
            ? "pause"
            : token.type === "filler"
              ? "filler"
              : "word",
        ...block,
      });
  }

  const brollBlocks: MapBlock[] = [];
  for (const item of broll) {
    const block = blockOf(range, item.startMs, item.endMs);
    if (block) brollBlocks.push(block);
  }
  return {
    durationMs,
    tokens: mapTokens,
    cuts,
    broll: brollBlocks,
    ticks: rulerTicks(durationMs),
  };
}

/** Batang teks di jalur teks peta klip. */
export interface MapTextBar extends MapBlock {
  id: string;
  /** Lajur (0 = paling atas); teks yang bertumpuk di waktu menempati lajur berbeda. */
  lane: number;
  /** `false` = seluruh rentangnya di bagian terpotong (tidak tampil di video). */
  shown: boolean;
}

/**
 * Jalur teks peta klip: tiap teks → batang di sumbu klip asli (dijepit ke klip; di luar klip tidak
 * digambar). Lajur dibagi rakus menurut waktu mulai — teks mendapat lajur teratas yang sudah
 * kosong saat ia mulai — sehingga teks yang bertumpuk di waktu tidak saling menutupi.
 */
export function layoutTextLanes(input: {
  range: TimeRange;
  timeline: Timeline;
  texts: readonly (TimeRange & { id: string })[];
}): { bars: MapTextBar[]; lanes: number } {
  const { range, timeline, texts } = input;
  const laneEnds: number[] = [];
  const bars: MapTextBar[] = [];
  const ordered = texts
    .map((text, index) => ({ text, index }))
    .sort((a, b) => a.text.startMs - b.text.startMs || a.index - b.index);
  for (const { text } of ordered) {
    const block = blockOf(range, text.startMs, text.endMs);
    if (!block) continue;
    let lane = laneEnds.findIndex((end) => end <= text.startMs);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = text.endMs;
    const shown = timeline.segments.some(
      (s) => s.startMs < text.endMs && s.endMs > text.startMs,
    );
    bars.push({ id: text.id, lane, shown, ...block });
  }
  return { bars, lanes: laneEnds.length };
}

/** Rentang klip di dalam video sumber (minimap "Di video asli"); `null` bila durasi sumber tak diketahui. */
export function sourceMinimap(
  range: TimeRange,
  sourceDurationMs: number | null,
): (MapBlock & { startMs: number; endMs: number; totalMs: number }) | null {
  if (sourceDurationMs === null || sourceDurationMs <= 0) return null;
  const total: TimeRange = { startMs: 0, endMs: sourceDurationMs };
  const block = blockOf(total, range.startMs, range.endMs);
  if (!block) return null;
  return {
    ...block,
    startMs: range.startMs,
    endMs: range.endMs,
    totalMs: sourceDurationMs,
  };
}
