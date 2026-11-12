// API publik modul social. Modul lain & presentation hanya import dari file ini.
export { MAX_SPOKEN_CHARS, spokenText } from "../domain/spoken-text";
export type {
  ClipLookup,
  ClipPostCopy,
  ClipSpeechSource,
  JobQueue,
  PostCopyStatus,
  ProjectJobs,
  StartPostCopyResult,
} from "./clip-post-copy";
export { GetPostCopy, StartPostCopy } from "./clip-post-copy";
