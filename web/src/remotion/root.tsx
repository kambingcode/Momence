import { Composition } from "remotion";
import { presetStyle } from "@/modules/captions/application";
import { COMPOSITION_FPS, compositionSize } from "@/modules/render/application";
import { ClipComposition, type ClipCompositionProps } from "./clip-composition";

/** Id komposisi yang dirender `scripts/render-clip.mts`. */
export const CLIP_COMPOSITION_ID = "clip";

const defaultProps: ClipCompositionProps = {
  src: "",
  plan: { fps: COMPOSITION_FPS, durationInFrames: 0, sequences: [] },
  aspectRatio: "9:16",
  layout: "fill",
  crop: [],
  captions: { pages: [], style: presetStyle() },
  broll: [],
  textOverlays: [],
};

const defaultSize = compositionSize(defaultProps.aspectRatio);

/** Root Remotion untuk render di server; durasi & ukuran mengikuti plan dan rasio dari props. */
export function RemotionRoot() {
  return (
    <Composition
      id={CLIP_COMPOSITION_ID}
      component={ClipComposition}
      width={defaultSize.width}
      height={defaultSize.height}
      fps={COMPOSITION_FPS}
      durationInFrames={1}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, props.plan.durationInFrames),
        fps: props.plan.fps,
        // Job render yang diantre sebelum pilihan rasio tidak membawa `aspectRatio`.
        ...compositionSize(props.aspectRatio ?? "9:16"),
      })}
    />
  );
}
