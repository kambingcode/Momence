"use client";

import { cn } from "cn";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatDuration } from "@/features/projects/ui/format";
import {
  collapsedAt,
  type EditorToken,
  layoutClipMap,
  layoutTextLanes,
  percentOf,
  type RangeEdit,
  playableSourceMs,
  sourceMinimap,
  sourceMsAtPercent,
  textRangeAfterDrag,
  type Timeline,
  type TimeRange,
} from "@/modules/editor/application";
import { tokenIndexAt } from "@/modules/transcript/application";
import { useEditor } from "./editor-store";
import type { Playhead } from "./playhead-store";

/** Arsiran diagonal = bagian terpotong (bentuk, bukan warna). */
const HATCH =
  "repeating-linear-gradient(135deg, var(--color-primary) 0 1px, transparent 1px 4px)";
const KEY_STEP_MS = 1000;
const MAX_TICK_PCT = 93;
/** Tinggi satu lajur teks (px), termasuk celah. */
const TEXT_LANE_PX = 18;
/** Lebar area tepi batang teks yang menarik awal/akhir (px). */
const TEXT_EDGE_PX = 6;
/** Lajur teks yang terlihat sekaligus; sisanya digulir agar peta tidak menekan kolom di atasnya. */
const TEXT_VISIBLE_LANES = 4;
/** Geser rentang teks dengan panah (ms). */
const TEXT_KEY_STEP_MS = 500;

interface ClipMapProps {
  tokens: readonly EditorToken[];
  timeline: Timeline;
  /** Rentang klip asli di video sumber. */
  range: TimeRange;
  broll: readonly TimeRange[];
  /** Durasi video sumber (untuk minimap "Di video asli"); `null` = tidak diketahui. */
  sourceDurationMs: number | null;
  playhead: Playhead;
  onSeek: (sourceMs: number) => void;
}

/**
 * Peta klip: seluruh klip asli dalam satu pita — jeda, filler, bagian terpotong (arsiran), B-roll
 * (batang di atas), playhead, penggaris waktu, dan minimap letak klip di video sumber. Klik/seret
 * (atau ←/→/Home/End) memindahkan pratinjau & kursor transkrip.
 */
export function ClipMap({
  tokens,
  timeline,
  range,
  broll,
  sourceDurationMs,
  playhead,
  onSeek,
}: ClipMapProps) {
  const setCursor = useEditor((s) => s.setCursor);
  const layout = useMemo(
    () => layoutClipMap({ tokens, timeline, range, broll }),
    [tokens, timeline, range, broll],
  );
  const minimap = sourceMinimap(range, sourceDurationMs);
  const originalMs = layout.durationMs;
  // Nilai ARIA diperbarui per detik (bukan per frame) agar peta tidak dirender ulang terus.
  const playheadSecond = useSyncExternalStore(
    playhead.subscribe,
    () => Math.floor(playhead.get() / 1000),
    () => Math.floor(range.startMs / 1000),
  );
  const elapsedS = Math.max(
    0,
    playheadSecond - Math.floor(range.startMs / 1000),
  );
  const empty = timeline.segments.length === 0;

  /** Lompat ke waktu sumber (di dalam potongan → awal bagian berikutnya) & taruh kursor di kata itu. */
  const seekTo = (sourceMs: number) => {
    const target =
      playableSourceMs(timeline, sourceMs) ??
      timeline.segments.at(-1)?.endMs ??
      null;
    if (target === null) return;
    onSeek(target);
    const index = tokenIndexAt(tokens, target);
    if (tokens[index]) setCursor(collapsedAt(index));
  };
  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    seekTo(sourceMsAtPercent(range, pct));
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const now = playhead.get();
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
        next = now - KEY_STEP_MS;
        break;
      case "ArrowRight":
        next = now + KEY_STEP_MS;
        break;
      case "Home":
        next = range.startMs;
        break;
      case "End":
        next = range.endMs;
        break;
      default:
        return;
    }
    event.preventDefault();
    seekTo(Math.min(range.endMs, Math.max(range.startMs, next)));
  };

  return (
    <section
      aria-label="Peta klip"
      className="shrink-0 space-y-2 border-t px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium">Peta klip</h2>
          <p className="label-mono text-muted-foreground tabular-nums">
            {formatDuration(originalMs)} asli →{" "}
            {formatDuration(timeline.durationMs)}
          </p>
          <ul
            className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs"
            aria-label="Legenda"
          >
            <LegendItem label="Terpotong">
              <span
                className="border-primary size-3 rounded-xs border"
                style={{ backgroundImage: HATCH }}
              />
            </LegendItem>
            <LegendItem label="Jeda">
              <span className="bg-border h-3 w-4 rounded-xs" />
            </LegendItem>
            <LegendItem label="Filler">
              <span className="bg-muted-foreground relative h-3 w-4 rounded-xs">
                <span className="bg-primary absolute inset-x-0 -bottom-0.5 h-0.5" />
              </span>
            </LegendItem>
            <LegendItem label="B-roll">
              <span className="bg-primary h-1.5 w-4 rounded-full" />
            </LegendItem>
            <LegendItem label="Teks">
              <span className="border-primary bg-background h-3 w-4 rounded-xs border" />
            </LegendItem>
          </ul>
        </div>
        {minimap && (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            Di video asli
            <span
              className="bg-border relative h-1.5 w-28 rounded-full"
              aria-hidden
            >
              <span
                className="bg-primary absolute inset-y-0 min-w-1 rounded-full"
                style={{
                  left: `${minimap.leftPct}%`,
                  width: `${minimap.widthPct}%`,
                }}
              />
            </span>
            <span className="label-mono tabular-nums">
              {formatDuration(minimap.startMs)}–{formatDuration(minimap.endMs)}{" "}
              / {formatDuration(minimap.totalMs)}
            </span>
          </p>
        )}
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Peta klip: posisi pemutaran"
        aria-valuemin={0}
        aria-valuemax={Math.round(originalMs / 1000)}
        aria-valuenow={elapsedS}
        aria-valuetext={`${formatDuration(elapsedS * 1000)} dari ${formatDuration(originalMs)}`}
        aria-disabled={empty}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (empty || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1 && !empty) seekFromPointer(event);
        }}
        className={cn(
          "focus-visible:ring-ring/30 relative h-14 touch-none rounded-lg outline-none select-none focus-visible:ring-3",
          empty ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        )}
        data-testid="clip-map"
      >
        <div className="absolute inset-x-0 top-0 h-1.5" aria-hidden>
          {layout.broll.map((block, index) => (
            <span
              key={index}
              data-kind="broll"
              className="bg-primary absolute inset-y-0 rounded-full"
              style={{ left: `${block.leftPct}%`, width: `${block.widthPct}%` }}
            />
          ))}
        </div>
        <div
          className="bg-secondary absolute inset-x-0 top-3 bottom-0 overflow-hidden rounded-lg"
          aria-hidden
        >
          {layout.tokens.map((token, index) => (
            <span
              key={index}
              data-kind={token.kind}
              className={cn(
                "absolute rounded-[1px]",
                token.kind === "pause" && "bg-border inset-y-1.5",
                token.kind === "word" && "bg-muted-foreground/70 inset-y-2",
                token.kind === "filler" &&
                  "bg-primary inset-y-2 shadow-[0_2px_0_0_var(--color-primary)]",
              )}
              style={{
                left: `${token.leftPct}%`,
                width: `max(1px, calc(${token.widthPct}% - 1px))`,
              }}
            />
          ))}
          {layout.cuts.map((block, index) => (
            <span
              key={index}
              data-kind="cut"
              className="border-primary/60 bg-background/70 absolute inset-y-0 border-x"
              style={{
                left: `${block.leftPct}%`,
                width: `${block.widthPct}%`,
                backgroundImage: HATCH,
              }}
            />
          ))}
        </div>
        <PlayheadLine playhead={playhead} range={range} />
      </div>

      <div className="relative h-4" aria-hidden>
        {layout.ticks
          // Label di ujung kanan terpotong; ujungnya sudah diwakili durasi di kepala.
          .filter((tick) => tick.leftPct <= MAX_TICK_PCT)
          .map((tick) => (
            <span
              key={tick.ms}
              className="label-mono text-muted-foreground absolute top-0 text-xs tabular-nums"
              style={{ left: `${tick.leftPct}%` }}
            >
              {formatDuration(tick.ms)}
            </span>
          ))}
      </div>

      <TextTrack range={range} timeline={timeline} onSeek={onSeek} />
    </section>
  );
}

function LegendItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5">
      {children}
      {label}
    </li>
  );
}

/** Garis vertikal posisi pemutaran; satu-satunya bagian yang dirender ulang tiap frame. */
function PlayheadLine({
  playhead,
  range,
}: {
  playhead: Playhead;
  range: TimeRange;
}) {
  const sourceMs = useSyncExternalStore(
    playhead.subscribe,
    playhead.get,
    playhead.get,
  );
  return (
    <span
      data-testid="clip-map-playhead"
      className="bg-primary pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2"
      style={{ left: `${percentOf(range, sourceMs)}%` }}
      aria-hidden
    >
      <span className="bg-primary absolute -top-0.5 left-1/2 size-2 -translate-x-1/2 rounded-full" />
    </span>
  );
}

interface TextDragState {
  id: string;
  edit: RangeEdit;
  gesture: string;
  pointerX: number;
  initial: TimeRange;
  trackWidth: number;
  moved: boolean;
}

/**
 * Jalur teks di bawah peta (hanya bila ada teks): satu batang per teks, teks yang bertumpuk di
 * waktu di lajur berbeda. Seret badan = geser rentang, seret tepi = ubah awal/akhir (satu
 * seretan = satu langkah undo); klik = pilih & lompat ke awal teks; ←/→ geser 0,5 dtk, ⇧←/⇧→
 * ubah akhir.
 */
function TextTrack({
  range,
  timeline,
  onSeek,
}: {
  range: TimeRange;
  timeline: Timeline;
  onSeek: (sourceMs: number) => void;
}) {
  const textOverlays = useEditor((s) => s.textOverlays);
  const selectedId = useEditor((s) => s.selectedTextId);
  const selectText = useEditor((s) => s.selectText);
  const setTextRange = useEditor((s) => s.setTextRange);
  const { bars, lanes } = useMemo(
    () => layoutTextLanes({ range, timeline, texts: textOverlays }),
    [range, timeline, textOverlays],
  );
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<TextDragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  if (lanes === 0) return null;
  const byId = new Map(textOverlays.map((t) => [t.id, t]));
  const clipMs = range.endMs - range.startMs;

  const onPointerDown = (
    id: string,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const item = byId.get(id);
    const trackWidth = track.current?.getBoundingClientRect().width ?? 0;
    if (event.button !== 0 || !item || trackWidth === 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    const bar = event.currentTarget.getBoundingClientRect();
    const fromLeft = event.clientX - bar.left;
    const fromRight = bar.right - event.clientX;
    // Batang yang sangat sempit: tepi tidak boleh menutupi seluruh badannya.
    const edge = Math.min(TEXT_EDGE_PX, bar.width / 3);
    selectText(id);
    drag.current = {
      id,
      edit: fromLeft <= edge ? "start" : fromRight <= edge ? "end" : "move",
      gesture: crypto.randomUUID(),
      pointerX: event.clientX,
      initial: { startMs: item.startMs, endMs: item.endMs },
      trackWidth,
      moved: false,
    };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.pointerX;
    if (!current.moved && Math.abs(dx) < 3) return;
    current.moved = true;
    setDraggingId(current.id);
    const deltaMs = (dx / current.trackWidth) * clipMs;
    setTextRange(
      current.id,
      textRangeAfterDrag(current.initial, deltaMs, current.edit, range),
      current.gesture,
    );
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setDraggingId(null);
    // Klik tanpa seretan → lompat ke awal teks agar terlihat di pratinjau.
    if (!current.moved) onSeek(current.initial.startMs);
  };
  const onKeyDown = (
    id: string,
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    const item = byId.get(id);
    if (!item) return;
    const step =
      event.key === "ArrowLeft"
        ? -TEXT_KEY_STEP_MS
        : event.key === "ArrowRight"
          ? TEXT_KEY_STEP_MS
          : 0;
    if (step === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setTextRange(
      id,
      textRangeAfterDrag(item, step, event.shiftKey ? "end" : "move", range),
    );
  };

  return (
    <div
      className="overflow-y-auto"
      style={{ maxHeight: TEXT_VISIBLE_LANES * TEXT_LANE_PX }}
    >
      <div
        ref={track}
        role="group"
        aria-label="Teks di peta klip"
        data-testid="clip-map-texts"
        className="relative"
        style={{ height: lanes * TEXT_LANE_PX }}
      >
        {bars.map((bar) => {
          const item = byId.get(bar.id);
          if (!item) return null;
          const selected = bar.id === selectedId;
          const label = item.text.trim() || "(kosong)";
          const times = `${formatDuration(item.startMs - range.startMs)}–${formatDuration(item.endMs - range.startMs)}`;
          return (
            <div
              key={bar.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`Teks “${label}”, ${times}${bar.shown ? "" : ", seluruhnya terpotong"}. Seret untuk menggeser, tarik tepinya untuk mengubah durasi; ←/→ geser, ⇧←/⇧→ ubah akhir.`}
              title={`${label} · ${times}`}
              data-text-bar={bar.id}
              className={cn(
                "group focus-visible:ring-ring/30 absolute flex cursor-grab touch-none items-center overflow-hidden rounded-xs border px-1.5 text-xs outline-none select-none focus-visible:ring-3 active:cursor-grabbing",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary bg-background",
                !bar.shown && "text-muted-foreground border-dashed",
              )}
              style={{
                left: `${bar.leftPct}%`,
                width: `max(6px, ${bar.widthPct}%)`,
                top: bar.lane * TEXT_LANE_PX,
                height: TEXT_LANE_PX - 4,
                backgroundImage: bar.shown || selected ? undefined : HATCH,
              }}
              onPointerDown={(event) => onPointerDown(bar.id, event)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={(event) => onKeyDown(bar.id, event)}
            >
              {/* Pegangan tepi: kursor ubah ukuran (penentuan tepi dari posisi pointer). */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 cursor-ew-resize"
                style={{ width: TEXT_EDGE_PX }}
              />
              <span
                aria-hidden
                className="absolute inset-y-0 right-0 cursor-ew-resize"
                style={{ width: TEXT_EDGE_PX }}
              />
              <span className="truncate">
                {draggingId === bar.id ? (
                  <span className="label-mono tabular-nums">{times}</span>
                ) : (
                  label
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
