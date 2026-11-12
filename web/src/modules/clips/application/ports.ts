import type { ClipDetails } from "@/shared/schemas/clips";

/** Klip hasil job discover (ditulis worker). */
export interface Clip {
  id: string;
  projectId: string;
  title: string;
  startMs: number;
  endMs: number;
  /** 60–99 berbasis peringkat; `null` untuk klip yang tersimpan sebelum T3.2. */
  score: number | null;
  rank: number | null;
  details: ClipDetails;
}

/** Agregat klip satu proyek. */
export interface ProjectClipSummary {
  count: number;
  /** `rawScore` tertinggi (0–10); `null` bila tidak ada klip dengan `rawScore` berupa angka. */
  bestRawScore: number | null;
}

export interface ClipRepository {
  listByProject(projectId: string): Promise<Clip[]>;
  get(clipId: string): Promise<Clip | null>;
  /** Agregat per proyek; proyek tanpa klip tidak ada di hasil. */
  summarizeByProject(
    projectIds: readonly string[],
  ): Promise<Map<string, ProjectClipSummary>>;
}
