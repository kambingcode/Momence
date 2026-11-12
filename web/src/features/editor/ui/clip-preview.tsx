"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { Pause, Play } from "lucide-react";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  type RefObject,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatDuration } from "@/features/projects/ui/format";
import {
  type ClipRenderProps,
  compositionSize,
  frameAtOrAfter,
  frameToSourceMs,
  sourceMsToFrame,
} from "@/modules/render/application";
import {
  ClipComposition,
  type ClipCompositionProps,
} from "@/remotion/clip-composition";
import { isPlayPauseKey } from "./keyboard";

export interface ClipPreviewHandle {
  /** Pindah ke frame pertama pada/setelah posisi video sumber (ms) tanpa memutar. */
  seekToSource(sourceMs: number): void;
}

interface ClipPreviewProps {
  src: string;
  /** Props komposisi dari `composeClip` (sama dengan yang dirender). */
  composition: ClipRenderProps;
  /** Durasi timeline klip setelah potongan (sama dengan durasi di header). */
  durationMs: number;
  /** Posisi video sumber (ms) tiap frame saat diputar & setelah seek. */
  onSourceTime?: (sourceMs: number) => void;
  /**
   * Lapisan editor di atas video (mis. kotak teks); `frameRef` = bingkai Player. Bukan bagian
   * komposisi, jadi tidak ikut ter-render.
   */
  overlay?: (state: {
    frame: number;
    frameRef: RefObject<HTMLDivElement | null>;
  }) => ReactNode;
  ref?: Ref<ClipPreviewHandle>;
}

/**
 * Pratinjau dengan Remotion Player (ukuran sesuai rasio klip); komposisinya sama dengan yang
 * dirender. Kontrolnya
 * sendiri (bukan bawaan Remotion) agar waktu ditulis sama dengan durasi di header & halaman hasil.
 */
export function ClipPreview({
  src,
  composition,
  durationMs,
  onSourceTime,
  overlay,
  ref,
}: ClipPreviewProps) {
  const player = useRef<PlayerRef>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const { plan } = composition;
  const size = compositionSize(composition.aspectRatio);
  const inputProps = useMemo<ClipCompositionProps>(
    () => ({ ...composition, src }),
    [composition, src],
  );
  const onSourceTimeRef = useRef(onSourceTime);
  onSourceTimeRef.current = onSourceTime;
  // Posisi sumber terakhir: dipertahankan saat potongan berubah (frame komposisi bergeser).
  const sourceMs = useRef<number | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lastFrame = Math.max(0, plan.durationInFrames - 1);
  const empty = plan.durationInFrames === 0;

  useImperativeHandle(
    ref,
    () => ({
      seekToSource: (ms) => player.current?.seekTo(frameAtOrAfter(plan, ms)),
    }),
    [plan],
  );

  useEffect(() => {
    const current = player.current;
    if (!current) return;
    if (sourceMs.current !== null)
      current.seekTo(sourceMsToFrame(plan, sourceMs.current));
    const report = ({ detail }: { detail: { frame: number } }) => {
      setFrame(detail.frame);
      const ms = frameToSourceMs(plan, detail.frame);
      if (ms === null) return;
      sourceMs.current = ms;
      onSourceTimeRef.current?.(ms);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    current.addEventListener("frameupdate", report);
    current.addEventListener("seeked", report);
    current.addEventListener("play", onPlay);
    current.addEventListener("pause", onPause);
    return () => {
      current.removeEventListener("frameupdate", report);
      current.removeEventListener("seeked", report);
      current.removeEventListener("play", onPlay);
      current.removeEventListener("pause", onPause);
    };
  }, [plan]);

  // Space = putar/jeda di mana pun di editor, kecuali saat mengetik atau di tombol/dialog.
  useEffect(() => {
    if (empty) return;
    const onKey = (event: KeyboardEvent) => {
      if (!isPlayPauseKey(event)) return;
      event.preventDefault();
      player.current?.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [empty]);

  return (
    <div
      className="mx-auto w-full space-y-3"
      // Kanvas setinggi layar paling banyak.
      style={{
        maxWidth: `calc((100dvh - 16rem) * ${size.width} / ${size.height})`,
      }}
    >
      {/* Bingkai video mentah: tanpa sudut membulat/border (DESIGN.md → Imagery). */}
      <div className="relative">
        <div ref={frameRef} className="overflow-hidden bg-black">
          {empty ? (
            <div
              className="flex items-center justify-center p-4 text-center text-sm text-white/80"
              style={{ aspectRatio: `${size.width} / ${size.height}` }}
            >
              Semua bagian klip terhapus
            </div>
          ) : (
            <Player
              ref={player}
              component={ClipComposition}
              inputProps={inputProps}
              durationInFrames={plan.durationInFrames}
              fps={plan.fps}
              compositionWidth={size.width}
              compositionHeight={size.height}
              clickToPlay
              // Space ditangani listener global di atas; bawaan Remotion akan toggle dua kali.
              spaceKeyToPlayOrPause={false}
              acknowledgeRemotionLicense
              errorFallback={() => (
                <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white/80">
                  Video pratinjau tidak bisa dimuat.
                </div>
              )}
              style={{ width: "100%" }}
            />
          )}
        </div>
        {!empty && overlay?.({ frame, frameRef })}
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          className="shrink-0 rounded-full"
          onClick={() => player.current?.toggle()}
          disabled={empty}
          aria-label={playing ? "Jeda" : "Putar"}
          aria-keyshortcuts="Space"
          title={playing ? "Jeda (Space)" : "Putar (Space)"}
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </Button>
        <Slider
          min={0}
          max={lastFrame}
          step={1}
          value={[Math.min(frame, lastFrame)]}
          onValueChange={([next]) => player.current?.seekTo(next ?? 0)}
          disabled={empty}
          aria-label="Posisi di klip"
          className="min-w-0 flex-1"
        />
        <span className="label-mono text-muted-foreground shrink-0 tabular-nums">
          {formatDuration((frame * 1000) / plan.fps)} /{" "}
          {formatDuration(durationMs)}
        </span>
      </div>
    </div>
  );
}
