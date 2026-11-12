import type { Clip, ClipRepository } from "@/modules/clips/application";
import type { TranscriptRepository } from "@/modules/transcript/application";
import type { TranscriptToken } from "@/shared/schemas/transcript";
import { tokensFingerprint, tokensInRange } from "../domain/clip-tokens";

export interface ClipTokens {
  clip: Clip;
  /** Token transkrip di dalam rentang klip, berurutan. */
  tokens: TranscriptToken[];
  transcriptFingerprint: string;
}

export type ClipSource = Pick<ClipRepository, "get">;
export type TranscriptSource = Pick<TranscriptRepository, "findByProject">;

/** Klip + token transkripnya; `null` bila klip tidak ada. */
export async function loadClipTokens(
  clips: ClipSource,
  transcripts: TranscriptSource,
  clipId: string,
): Promise<ClipTokens | null> {
  const clip = await clips.get(clipId);
  if (!clip) return null;
  const transcript = await transcripts.findByProject(clip.projectId);
  const tokens = tokensInRange(transcript?.tokens ?? [], clip);
  return { clip, tokens, transcriptFingerprint: tokensFingerprint(tokens) };
}
