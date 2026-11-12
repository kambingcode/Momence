// API publik modul reframe. Modul lain & presentation hanya import dari file ini.
export type { CropKeyframe, CropRect, VideoBox } from "../domain/crop-track";
export { cropAt, videoBoxForCrop } from "../domain/crop-track";
export type {
  ClipLookup,
  ClipReframeState,
  CropTracksLookup,
  JobQueue,
  ProjectJobs,
  ReframeStatus,
  StartReframeResult,
} from "./clip-reframe";
export { GetClipReframe, StartClipReframe } from "./clip-reframe";
export type { ClipRange } from "./get-clip-crop-tracks";
export { GetClipCropTracks } from "./get-clip-crop-tracks";
export type { ClipReframeRepository, StoredClipReframe } from "./ports";
