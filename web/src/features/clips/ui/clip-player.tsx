"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/features/projects/ui/format";
import {
  clipToSourceMs,
  sourceToClipMs,
  type Timeline,
} from "@/modules/editor/application";
import { frameAction, playFromMs } from "./playback";
import { releaseVideo } from "./release-video";
import { useNearViewport } from "./use-near-viewport";

interface ClipPlayerProps {
  src: string;
  /** Bagian video sumber yang diputar berurutan; potongan di antaranya dilompati. */
  timeline: Timeline;
  title: string;
  /** CSS aspect-ratio video sumber, mis. "16 / 9". */
  aspectRatio: string;
  /** Hanya satu klip yang diputar di halaman; `false` → pemutar ini dijeda. */
  active?: boolean;
  onPlay?: () => void;
}

/** Memutar bagian klip dari video proxy: mulai di segmen pertama, berhenti di ujung klip. */
export function ClipPlayer({
  src,
  timeline,
  title,
  aspectRatio,
  active = true,
  onPlay,
}: ClipPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [failed, setFailed] = useState(false);
  const startMs = timeline.segments[0]?.startMs ?? null;
  // Daftar bisa berisi puluhan klip: `<video>` (±45 MB dekoder di Safari) hanya ada untuk kartu
  // di dekat layar atau yang sedang diputar.
  const near = useNearViewport(frameRef);
  const showVideo = (near || playing) && !failed;
  // Fragmen #t membuat browser menampilkan frame awal klip sebelum diputar.
  const videoUrl = `${src}#t=${(startMs ?? 0) / 1000}`;

  // `src` dipasang & dilepas di sini (bukan prop) agar dekoder dibebaskan segera saat `<video>`
  // dibuang, dan pasang-lepas ganda Strict Mode tetap meninggalkan video berisi.
  useEffect(() => {
    const video = videoRef.current;
    if (!showVideo || !video) return;
    video.src = videoUrl;
    return () => releaseVideo(video);
  }, [showVideo, videoUrl]);

  // Di-scroll jauh keluar layar saat diputar → dijeda, lalu `<video>`-nya dibuang.
  useEffect(() => {
    if (!near) videoRef.current?.pause();
  }, [near]);

  const showSource = useCallback(
    (sourceMs: number) => setElapsedMs(sourceToClipMs(timeline, sourceMs)),
    [timeline],
  );

  const seekToSource = useCallback(
    (sourceMs: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = sourceMs / 1000;
      showSource(sourceMs);
    },
    [showSource],
  );

  useEffect(() => {
    if (!active) videoRef.current?.pause();
  }, [active]);

  // Potongan berubah (mis. kata dihapus) → perbarui posisi relatif tanpa menunggu frame.
  useEffect(() => {
    const video = videoRef.current;
    if (video && video.readyState > 0) showSource(video.currentTime * 1000);
  }, [showSource]);

  // timeupdate hanya ±4×/dtk: pakai requestAnimationFrame agar potongan & ujung klip tepat.
  useEffect(() => {
    const video = videoRef.current;
    if (!playing || !video) return;
    let frame = 0;
    const tick = () => {
      const currentMs = video.currentTime * 1000;
      const action = frameAction(timeline, currentMs);
      if (action.kind === "end") {
        video.pause();
        if (startMs !== null) seekToSource(startMs);
        return;
      }
      if (action.kind === "jump") {
        video.currentTime = action.toMs / 1000;
        showSource(action.toMs);
      } else {
        showSource(currentMs);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, timeline, startMs, seekToSource, showSource]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    const from = playFromMs(timeline, video.currentTime * 1000);
    if (from === null) return;
    video.currentTime = from / 1000;
    onPlay?.();
    video.play().catch(() => setPlaying(false));
  };

  const seekClip = (clipMs: number) => {
    const sourceMs = clipToSourceMs(timeline, clipMs);
    if (sourceMs !== null) seekToSource(sourceMs);
  };

  if (failed)
    return (
      <div
        className="bg-muted text-muted-foreground flex items-center justify-center rounded-md text-sm"
        style={{ aspectRatio }}
      >
        Video pratinjau tidak bisa dimuat.
      </div>
    );

  const empty = startMs === null;
  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-md bg-black"
      >
        {showVideo ? (
          <video
            ref={videoRef}
            preload="metadata"
            playsInline
            onLoadedMetadata={() => {
              if (startMs !== null) seekToSource(startMs);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setFailed(true)}
            onClick={toggle}
            className="w-full cursor-pointer"
            style={{ aspectRatio }}
          />
        ) : (
          <div style={{ aspectRatio }} />
        )}
        {!playing && (
          <button
            type="button"
            onClick={toggle}
            disabled={empty}
            aria-label={`Putar klip ${title}`}
            className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30 disabled:cursor-not-allowed"
          >
            {empty ? (
              <span className="rounded-md bg-black/70 px-3 py-1.5 text-sm text-white">
                Semua bagian klip terhapus
              </span>
            ) : (
              <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-black shadow">
                <Play className="ml-0.5 size-6" aria-hidden />
              </span>
            )}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          disabled={empty}
          aria-label={playing ? "Jeda" : "Putar"}
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </Button>
        <input
          type="range"
          min={0}
          max={timeline.durationMs}
          step={100}
          value={Math.min(elapsedMs, timeline.durationMs)}
          onChange={(event) => seekClip(Number(event.currentTarget.value))}
          disabled={empty || !showVideo}
          aria-label={`Posisi di klip ${title}`}
          className="accent-primary h-1 min-w-0 flex-1 cursor-pointer"
        />
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {formatDuration(elapsedMs)} / {formatDuration(timeline.durationMs)}
        </span>
      </div>
    </div>
  );
}
