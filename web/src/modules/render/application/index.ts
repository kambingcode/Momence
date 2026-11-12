// API publik modul render. Modul lain & presentation hanya import dari file ini.
export type { BrollSequence, BrollSource } from "../domain/broll";
export { brollSequences } from "../domain/broll";
export type {
  CompositionPlan,
  OutputRatio,
  PlanSequence,
  SourceRange,
} from "../domain/composition";
export {
  COMPOSITION_FPS,
  compositionPlan,
  compositionSize,
  frameAtOrAfter,
  frameToSourceMs,
  sourceMsToFrame,
} from "../domain/composition";
export { attachmentHeader, downloadFileName } from "../domain/output";
export type { TextSequence, TextSource } from "../domain/text";
export { textSequences, visibleTextIds } from "../domain/text";
export type {
  ClipLayout,
  ClipRenderProps,
  ComposeClipInput,
  ComposedClip,
  TextOverlayStyle,
} from "./compose-clip";
export { composeClip, usesFaceCrop } from "./compose-clip";
export type { ClipLookup, JobSource, RenderOutput } from "./open-render-output";
export { OpenRenderOutput } from "./open-render-output";
export type {
  ClipEditorSource,
  JobQueue,
  ProjectSource,
  ReframeStatusSource,
  StartRenderResult,
} from "./start-clip-render";
export { StartClipRender } from "./start-clip-render";
