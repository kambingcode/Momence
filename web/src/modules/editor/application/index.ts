// API publik modul editor. Modul lain & presentation hanya import dari file ini.
export type { EditorToken, TimeRange } from "../domain/clip-tokens";
export { tokensFingerprint, tokensInRange } from "../domain/clip-tokens";
export {
  correctionsForAll,
  matchingWords,
  splitPunctuation,
} from "../domain/corrections";
export type { RemovalGroup, RemovalKind } from "../domain/edits";
export {
  addRemoval,
  applyCorrections,
  removalOf,
  removedIdSet,
  restoreRemoval,
  restoreTouching,
} from "../domain/edits";
export type { TokenEdits } from "../domain/script-rules";
export type {
  ClipMapLayout,
  MapBlock,
  MapTextBar,
  MapToken,
  RulerTick,
} from "../domain/clip-map";
export {
  layoutClipMap,
  layoutTextLanes,
  percentOf,
  rulerTicks,
  sourceMinimap,
  sourceMsAtPercent,
} from "../domain/clip-map";
export type { Cursor, DeleteResult } from "../domain/selection";
export {
  collapsedAt,
  deleteAtCursor,
  dragSelection,
  isDragMove,
  moveCaret,
  restoreTargets,
  selectedRange,
} from "../domain/selection";
export type { CutSummary, TranscriptStats } from "../domain/stats";
export { cutSummary, transcriptStats } from "../domain/stats";
export type { Timeline } from "../domain/timeline";
export {
  buildTimeline,
  clipToSourceMs,
  playableSourceMs,
  sourceToClipMs,
  SPEECH_MARGIN_MS,
} from "../domain/timeline";
export { tokenEditsProblem } from "../domain/script-rules";
export type { RangeEdit, TextDrag } from "../domain/text-overlays";
export {
  clampTextPosition,
  clampTextRange,
  defaultTextRange,
  dragTextPosition,
  moveInStack,
  TEXT_DEFAULT_DURATION_MS,
  TEXT_MIN_DURATION_MS,
  TEXT_SNAP_PX,
  textRangeAfterDrag,
} from "../domain/text-overlays";
export { GetClipEditor } from "./get-clip-editor";
export type { ClipEditorData, CropTracksSource } from "./get-clip-editor";
export type { ClipTokens } from "./load-clip-tokens";
export type {
  EditingScriptRepository,
  SaveScriptOutcome,
  StoredEditingScript,
} from "./ports";
export { SaveEditingScript } from "./save-editing-script";
export type { SaveEditingScriptResult } from "./save-editing-script";
