// API publik modul broll. Modul lain & presentation hanya import dari file ini.
export type { BrollRow } from "../domain/placement";
export {
  brollRows,
  manualRange,
  placeBroll,
  removeBrollAt,
} from "../domain/placement";
export { brollPlanTokens, hasSpeech, visibleMs } from "../domain/plan-tokens";
export type { Orientation } from "../domain/orientation";
export { orientationFirst, orientationOf } from "../domain/orientation";
export type { VideoFile } from "../domain/video-files";
export {
  pickVideoFile,
  PREVIEW_SHORT_SIDE,
  RENDER_SHORT_SIDE,
} from "../domain/video-files";
export type {
  BrollPlanStatus,
  ClipBrollPlan,
  ClipEditorSource,
  ClipLookup,
  JobQueue,
  ProjectJobs,
  StartBrollPlanResult,
} from "./clip-broll-plan";
export { GetBrollPlan, StartBrollPlan } from "./clip-broll-plan";
export type { Clock } from "./caching-stock-video-search";
export {
  CachingStockVideoSearch,
  STOCK_CACHE_MAX_ENTRIES,
  STOCK_CACHE_TTL_MS,
} from "./caching-stock-video-search";
export type {
  SearchStockVideosResult,
  StockOrientation,
  StockSearchQuery,
  StockVideoSearch,
} from "./search-stock-videos";
export {
  SearchStockVideos,
  STOCK_PAGE_SIZE,
  StockSearchError,
} from "./search-stock-videos";
