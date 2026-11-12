import type {
  TranscriptLanguage,
  TranscriptToken,
} from "@/shared/schemas/transcript";

export interface Transcript {
  id: string;
  projectId: string;
  sourceId: string;
  /** `null` bila audio tidak berisi ucapan. */
  language: TranscriptLanguage | null;
  tokens: TranscriptToken[];
}

export interface TranscriptRepository {
  /** Transkrip video sumber proyek (satu sumber per proyek); `null` bila belum ada. */
  findByProject(projectId: string): Promise<Transcript | null>;
}
