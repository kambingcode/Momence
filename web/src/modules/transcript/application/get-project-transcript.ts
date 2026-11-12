import type { Transcript, TranscriptRepository } from "./ports";

export class GetProjectTranscript {
  constructor(private readonly transcripts: TranscriptRepository) {}

  execute(projectId: string): Promise<Transcript | null> {
    return this.transcripts.findByProject(projectId);
  }
}
