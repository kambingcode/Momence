import { sourceToClipMs, type Timeline } from "@/modules/editor/application";
import {
  type CaptionPage,
  captionPages,
  type CaptionToken,
  captionWords,
} from "../domain/pages";
import { CAPTION_PRESETS, type CaptionStyle } from "../domain/style";

export interface ClipCaptionsInput {
  tokens: readonly CaptionToken[];
  removedIds: ReadonlySet<string>;
  corrections: Readonly<Record<string, string>>;
  keywords: readonly string[];
  /** Timeline klip setelah potongan (`buildTimeline`). */
  timeline: Timeline;
  style: CaptionStyle;
}

/** Halaman caption klip pada waktu klip; sama untuk pratinjau editor dan render. */
export function clipCaptions(input: ClipCaptionsInput): CaptionPage[] {
  const words = captionWords({
    tokens: input.tokens,
    removedIds: input.removedIds,
    corrections: input.corrections,
    keywords: input.keywords,
    toClipMs: (sourceMs) => sourceToClipMs(input.timeline, sourceMs),
  });
  return captionPages(
    words,
    CAPTION_PRESETS[input.style.preset].rules,
    input.timeline.durationMs,
  );
}
