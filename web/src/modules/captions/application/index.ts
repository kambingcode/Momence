// API publik modul captions. Modul lain & presentation hanya import dari file ini.
export type { CaptionPage, CaptionToken, CaptionWord } from "../domain/pages";
export { keywordKey, PAGE_GAP_MS, PAGE_LINGER_MS } from "../domain/pages";
export { activeWordIndex, pageAt, wordProgress } from "../domain/playback";
export type {
  CaptionFont,
  CaptionPosition,
  CaptionPreset,
  CaptionPresetId,
  CaptionStyle,
} from "../domain/style";
export {
  CAPTION_PRESET_IDS,
  CAPTION_PRESETS,
  DEFAULT_CAPTION_PRESET,
  presetStyle,
} from "../domain/style";
export type { ClipCaptionsInput } from "./clip-captions";
export { clipCaptions } from "./clip-captions";
