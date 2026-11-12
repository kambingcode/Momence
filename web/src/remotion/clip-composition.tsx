import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  getRemotionEnvironment,
  Html5Video,
  OffthreadVideo,
  Sequence,
  Series,
  useCurrentFrame,
} from "remotion";
import { cropAt, videoBoxForCrop } from "@/modules/reframe/application";
import type { ClipRenderProps } from "@/modules/render/application";
import { CaptionLayer } from "./captions/caption-layer";
import { TextOverlayLayer } from "./text/text-overlay-layer";

export type ClipCompositionProps = ClipRenderProps & {
  /** URL video: proxy untuk pratinjau, sumber resolusi penuh untuk render. */
  src: string;
};

/** Bagian berikutnya dimuat sedini ini agar sambungan potongan tidak tersendat. */
const PREMOUNT_SECONDS = 1;

/**
 * Mati: di Safari Remotion menahan timeline di frame 0 sambil menunggu frame pertama video, lalu
 * terus me-seek ulang ke awal (pratinjau mengulang ±0,2 dtk tanpa henti). Proxy dibaca dari disk
 * lokal; B-roll (Pixabay) di jaringan lambat bisa sesaat tertinggal, tetapi tidak mengunci
 * pratinjau. Render tidak terpengaruh (frame menunggu video dimuat).
 */
const PAUSE_WHEN_BUFFERING = false;

const FULL: CSSProperties = { width: "100%", height: "100%" };

/** Latar `fit`: video yang sama memenuhi frame, diburamkan & digelapkan. */
const BLURRED_BACKGROUND: CSSProperties = {
  ...FULL,
  objectFit: "cover",
  // Diperbesar sedikit agar tepi buram (transparan) tidak terlihat.
  transform: "scale(1.15)",
  filter: "blur(40px) brightness(0.6)",
};

/**
 * B-roll: video stok bisu yang memenuhi frame (crop cover) di atas video utama pada rentangnya.
 * Pratinjau memakai file kecil, render memakai file resolusi penuh.
 */
function BrollLayer({
  broll,
  fps,
}: {
  broll: ClipCompositionProps["broll"];
  fps: number;
}) {
  const rendering = getRemotionEnvironment().isRendering;
  const Video = rendering ? OffthreadVideo : Html5Video;
  return broll.map((sequence) => (
    <Sequence
      key={`${sequence.fromFrame}-${sequence.url}`}
      from={sequence.fromFrame}
      durationInFrames={sequence.durationInFrames}
      premountFor={PREMOUNT_SECONDS * fps}
    >
      <Video
        src={rendering ? sequence.url : sequence.previewUrl}
        trimBefore={sequence.trimBeforeFrames}
        muted
        pauseWhenBuffering={PAUSE_WHEN_BUFFERING}
        style={{ ...FULL, objectFit: "cover" }}
      />
    </Sequence>
  ));
}

type SourceVideoProps = Pick<
  ClipCompositionProps,
  "src" | "layout" | "crop"
> & {
  fps: number;
  sourceStartFrame: number;
};

/**
 * Satu bagian video sumber. `fill`: crop auto-reframe pada waktu sumber frame ini (video
 * diperbesar & digeser), tanpa crop → crop tengah. `fit`: video utuh di atas salinannya yang
 * diburamkan.
 */
function SourceVideo({
  src,
  layout,
  crop,
  fps,
  sourceStartFrame,
}: SourceVideoProps) {
  // Frame relatif terhadap awal sequence (bagian ini).
  const frame = useCurrentFrame();
  const Video = getRemotionEnvironment().isRendering
    ? OffthreadVideo
    : Html5Video;
  if (layout === "fit") {
    return (
      <>
        <Video
          src={src}
          trimBefore={sourceStartFrame}
          muted
          pauseWhenBuffering={PAUSE_WHEN_BUFFERING}
          style={BLURRED_BACKGROUND}
        />
        <AbsoluteFill>
          <Video
            src={src}
            trimBefore={sourceStartFrame}
            pauseWhenBuffering={PAUSE_WHEN_BUFFERING}
            style={{ ...FULL, objectFit: "contain" }}
          />
        </AbsoluteFill>
      </>
    );
  }
  const rect = cropAt(crop, ((sourceStartFrame + frame) * 1000) / fps);
  const box = rect && videoBoxForCrop(rect);
  return (
    <Video
      src={src}
      trimBefore={sourceStartFrame}
      pauseWhenBuffering={PAUSE_WHEN_BUFFERING}
      style={
        box
          ? {
              position: "absolute",
              left: `${box.left}%`,
              top: `${box.top}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
              maxWidth: "none",
              objectFit: "fill",
            }
          : { ...FULL, objectFit: "cover" }
      }
    />
  );
}

/**
 * Komposisi klip (ukuran sesuai rasio): bagian video sumber yang dipertahankan diputar berurutan (satu sequence
 * per bagian, mulai di frame sumbernya), B-roll di atasnya, teks custom, lalu caption animasi. Pratinjau memakai
 * `<Html5Video>`, render memakai `<OffthreadVideo>` yang frame-akurat.
 */
export function ClipComposition({
  src,
  plan,
  layout,
  // Job render yang diantre sebelum auto-reframe tidak membawa `crop`.
  crop = [],
  captions,
  // Job render yang diantre sebelum B-roll tidak membawa `broll`.
  broll = [],
  // Job render yang diantre sebelum teks custom tidak membawa `textOverlays`.
  textOverlays = [],
}: ClipCompositionProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      <Series>
        {plan.sequences.map((sequence) => (
          <Series.Sequence
            key={sequence.fromFrame}
            durationInFrames={sequence.durationInFrames}
            premountFor={PREMOUNT_SECONDS * plan.fps}
          >
            <SourceVideo
              src={src}
              layout={layout}
              crop={crop}
              fps={plan.fps}
              sourceStartFrame={sequence.sourceStartFrame}
            />
          </Series.Sequence>
        ))}
      </Series>
      <BrollLayer broll={broll} fps={plan.fps} />
      <TextOverlayLayer items={textOverlays} />
      <CaptionLayer pages={captions.pages} style={captions.style} />
    </AbsoluteFill>
  );
}
