// API publik modul cleanup. Modul lain & presentation hanya import dari file ini.
export type {
  CleanupKind,
  CleanupMatch,
  CleanupToken,
} from "../domain/cleanup";
export type { FillerConfig } from "../domain/fillers";
export {
  DEFAULT_FILLER_CONFIG,
  DEFAULT_FILLER_PHRASES,
  DEFAULT_FILLER_WORDS,
  detectFillers,
  fillerKey,
  REPEAT_MAX_GAP_MS,
} from "../domain/fillers";
export {
  DEFAULT_PAUSE_MS,
  detectPauses,
  PAUSE_SLIDER_MS,
} from "../domain/pauses";
export { indexOfMatch, stepMatch } from "../domain/navigation";
export type { CleanupRemoval } from "../domain/speech-cleanup";
export { findCleanup, removalsFor } from "../domain/speech-cleanup";
