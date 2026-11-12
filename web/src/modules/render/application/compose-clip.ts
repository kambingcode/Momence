import {
  type CaptionPage,
  type CaptionStyle,
  clipCaptions,
  presetStyle,
} from "@/modules/captions/application";
import {
  buildTimeline,
  type EditorToken,
  type RemovalGroup,
  removedIdSet,
  type TimeRange,
  type Timeline,
} from "@/modules/editor/application";
import type {
  AspectRatio,
  CropKeyframe,
  CropTracks,
  ReframeSettings,
  TextOverlay,
} from "@/shared/schemas";
import {
  type BrollSequence,
  type BrollSource,
  brollSequences,
} from "../domain/broll";
import { compositionPlan, type CompositionPlan } from "../domain/composition";
import { type TextSequence, textSequences } from "../domain/text";

/** `fill` = crop memenuhi frame, `fit` = video utuh di atas latar blur. */
export type ClipLayout = ReframeSettings["layout"];

/** Isi & gaya satu teks custom di komposisi (rentang waktunya sudah jadi frame). */
export type TextOverlayStyle = Omit<TextOverlay, "startMs" | "endMs">;

/**
 * Props komposisi Remotion `clip` tanpa `src` (URL video: proxy untuk pratinjau, sumber resolusi
 * penuh untuk render). `type`, bukan `interface`: Remotion mensyaratkan `Record<string, unknown>`.
 */
export type ClipRenderProps = {
  plan: CompositionPlan;
  /** Rasio (ukuran) video hasil. */
  aspectRatio: AspectRatio;
  layout: ClipLayout;
  /** Jalur crop auto-reframe (waktu sumber) untuk `fill`; `[]` = crop tengah. */
  crop: CropKeyframe[];
  captions: { pages: CaptionPage[]; style: CaptionStyle };
  /** B-roll di atas video utama (bisu), dalam frame komposisi. */
  broll: BrollSequence[];
  /** Teks custom (urutan tumpuk: yang terakhir paling depan), dalam frame komposisi. */
  textOverlays: TextSequence<TextOverlayStyle>[];
};

export interface ComposeClipInput {
  /** Rentang klip di video sumber. */
  range: TimeRange;
  tokens: readonly EditorToken[];
  removed: readonly Pick<RemovalGroup, "tokenIds">[];
  corrections: Readonly<Record<string, string>>;
  /** `null` = preset caption bawaan. */
  caption: CaptionStyle | null;
  reframe: ReframeSettings;
  /** Hasil analisis reframe klip; `null` = belum dianalisis (crop tengah). */
  cropTracks: CropTracks | null;
  keywords: readonly string[];
  /** B-roll terpasang (rentang waktu sumber). */
  broll: readonly BrollSource[];
  /** Teks custom (rentang waktu sumber). */
  textOverlays: readonly TextOverlay[];
}

export interface ComposedClip {
  timeline: Timeline;
  props: ClipRenderProps;
}

/** Pengaturan ini memakai jalur crop yang mengikuti wajah (bukan crop tengah / video utuh). */
export const usesFaceCrop = (reframe: ReframeSettings): boolean =>
  reframe.layout === "fill" && reframe.tracker;

/** Dokumen editor → timeline & props komposisi; sama untuk pratinjau editor dan render. */
export function composeClip(input: ComposeClipInput): ComposedClip {
  const { reframe } = input;
  const removedIds = removedIdSet(input.removed);
  const timeline = buildTimeline(input.tokens, removedIds, input.range);
  const style = input.caption ?? presetStyle();
  const pages = clipCaptions({
    tokens: input.tokens,
    removedIds,
    corrections: input.corrections,
    keywords: input.keywords,
    timeline,
    style,
  });
  const plan = compositionPlan(timeline.segments);
  return {
    timeline,
    props: {
      plan,
      aspectRatio: reframe.aspectRatio,
      layout: reframe.layout,
      crop: usesFaceCrop(reframe)
        ? (input.cropTracks?.[reframe.aspectRatio] ?? [])
        : [],
      captions: { pages, style },
      broll: brollSequences(plan, input.broll),
      textOverlays: textSequences(plan, input.textOverlays),
    },
  };
}
