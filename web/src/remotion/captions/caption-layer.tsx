import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  activeWordIndex,
  type CaptionPosition,
  type CaptionStyle,
  type CaptionWord,
  pageAt,
  wordProgress,
} from "@/modules/captions/application";
import type { ClipRenderProps } from "@/modules/render/application";
import { captionFont } from "./fonts";

type CaptionTrack = ClipRenderProps["captions"];

/**
 * Letak blok caption sebagai bagian tinggi kanvas (260 & 380 px pada 1920 px; bawah dinaikkan
 * agar tidak tertutup UI aplikasi), sehingga sama untuk semua rasio.
 */
function placement(position: CaptionPosition, height: number): CSSProperties {
  switch (position) {
    case "top":
      return { justifyContent: "flex-start", paddingTop: height * 0.135 };
    case "middle":
      return { justifyContent: "center" };
    case "bottom":
      return { justifyContent: "flex-end", paddingBottom: height * 0.2 };
  }
}

type WordState = "upcoming" | "active" | "spoken";

interface WordProps {
  word: CaptionWord;
  state: WordState;
  style: CaptionStyle;
  tMs: number;
  /** Frame sejak kata (atau halaman, untuk animasi masuk) mulai. */
  sinceStart: number;
}

const baseColor = (word: CaptionWord, style: CaptionStyle) =>
  word.keyword ? style.keywordColor : style.textColor;

/** Pantulan singkat 0 → 1 (pop & animasi masuk). */
function useBounce(sinceStart: number) {
  const { fps } = useVideoConfig();
  return spring({
    frame: Math.max(0, sinceStart),
    fps,
    config: { damping: 12, stiffness: 220, mass: 0.6 },
    durationInFrames: Math.round(fps / 4),
  });
}

/** Karaoke fill: kata terisi warna dari kiri ke kanan selama diucapkan. */
function KaraokeWord({ word, state, style, tMs }: WordProps) {
  const progress = state === "upcoming" ? 0 : wordProgress(word, tMs) * 100;
  const base = baseColor(word, style);
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(90deg, ${style.highlightColor} ${progress}%, ${base} ${progress}%)`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}
    >
      {word.text}
    </span>
  );
}

/** Pop: kata yang diucapkan membesar dengan pantulan & berwarna. */
function PopWord({ word, state, style, sinceStart }: WordProps) {
  const bounce = useBounce(sinceStart);
  const active = state === "active";
  return (
    <span
      style={{
        display: "inline-block",
        color: active ? style.highlightColor : baseColor(word, style),
        transform: `scale(${active ? interpolate(bounce, [0, 1], [1, 1.18]) : 1})`,
      }}
    >
      {word.text}
    </span>
  );
}

/** Highlight box: kotak warna di belakang kata yang diucapkan. */
function BoxWord({ word, state, style, sinceStart }: WordProps) {
  const bounce = useBounce(sinceStart);
  const active = state === "active";
  return (
    <span
      style={{
        display: "inline-block",
        color: active ? style.textColor : baseColor(word, style),
        backgroundColor: active ? style.highlightColor : "transparent",
        borderRadius: style.size * 0.2,
        padding: `0 ${style.size * 0.16}px`,
        margin: `0 ${-style.size * 0.16}px`,
        transform: `scale(${active ? interpolate(bounce, [0, 1], [0.92, 1]) : 1})`,
      }}
    >
      {word.text}
    </span>
  );
}

/** Word-by-word: satu kata, muncul dengan pantulan. */
function SingleWord({ word, style, sinceStart }: WordProps) {
  const bounce = useBounce(sinceStart);
  return (
    <span
      style={{
        display: "inline-block",
        color: baseColor(word, style),
        transform: `scale(${interpolate(bounce, [0, 1], [0.6, 1])})`,
      }}
    >
      {word.text}
    </span>
  );
}

/** Simple: teks polos, kata yang diucapkan tidak disorot. */
function SimpleWord({ word, style }: WordProps) {
  return <span style={{ color: baseColor(word, style) }}>{word.text}</span>;
}

/** Bold uppercase: kata yang diucapkan berganti warna tanpa animasi. */
function ColorWord({ word, state, style }: WordProps) {
  const color =
    state === "active" ? style.highlightColor : baseColor(word, style);
  return <span style={{ color }}>{word.text}</span>;
}

const WORD_VIEWS: Record<
  CaptionStyle["preset"],
  (props: WordProps) => React.ReactNode
> = {
  karaoke: KaraokeWord,
  pop: PopWord,
  "highlight-box": BoxWord,
  "word-by-word": SingleWord,
  simple: SimpleWord,
  "bold-uppercase": ColorWord,
};

/** Caption animasi per kata di atas video, sesuai preset & gaya. */
export function CaptionLayer({ pages, style }: CaptionTrack) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const tMs = (frame * 1000) / fps;
  const page = pageAt(pages, tMs);
  if (!page) return null;

  const active = activeWordIndex(page, tMs);
  const face = captionFont(style.font);
  const WordView = WORD_VIEWS[style.preset];
  const toFrame = (ms: number) => Math.round((ms * fps) / 1000);
  // Simple: muncul halus per halaman, tanpa animasi kata.
  const opacity =
    style.preset === "simple"
      ? interpolate(frame - toFrame(page.startMs), [0, 4], [0, 1], {
          extrapolateRight: "clamp",
        })
      : 1;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        // Properti terpisah, bukan `padding`: shorthand bercampur paddingTop/Bottom posisi
        // membuat React salah memperbarui gaya saat posisi diganti.
        paddingLeft: 72,
        paddingRight: 72,
        ...placement(style.position, height),
      }}
    >
      <div
        data-testid="caption"
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          columnGap: style.size * 0.28,
          maxWidth: "100%",
          opacity,
          fontFamily: face.family,
          fontWeight: face.weight,
          fontSize: style.size,
          lineHeight: 1.2,
          textAlign: "center",
          textTransform: style.uppercase ? "uppercase" : "none",
          // Garis tepi di belakang isi + bayangan (drop-shadow, bukan text-shadow, agar tidak
          // tembus ke isi karaoke yang transparan).
          WebkitTextStroke: `${Math.max(2, style.size * 0.07)}px rgba(0, 0, 0, 0.85)`,
          paintOrder: "stroke fill",
          filter: `drop-shadow(0 ${style.size * 0.05}px ${style.size * 0.08}px rgba(0, 0, 0, 0.55))`,
        }}
      >
        {page.words.map((word, i) => (
          <WordView
            key={`${page.startMs}-${i}`}
            word={word}
            state={i < active ? "spoken" : i === active ? "active" : "upcoming"}
            style={style}
            tMs={tMs}
            sinceStart={
              frame -
              toFrame(
                style.preset === "word-by-word" ? page.startMs : word.startMs,
              )
            }
          />
        ))}
      </div>
    </AbsoluteFill>
  );
}
