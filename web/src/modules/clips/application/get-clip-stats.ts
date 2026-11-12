import { type ClipStats, bestClipScore } from "../domain/stats";
import type { ClipRepository } from "./ports";

/** Jumlah klip & skor klip terbaik per proyek; proyek tanpa klip tidak ada di hasil. */
export class GetClipStats {
  constructor(
    private readonly clips: Pick<ClipRepository, "summarizeByProject">,
  ) {}

  async execute(
    projectIds: readonly string[],
  ): Promise<Map<string, ClipStats>> {
    const summaries = await this.clips.summarizeByProject(projectIds);
    return new Map(
      [...summaries].map(([projectId, summary]) => [
        projectId,
        {
          count: summary.count,
          bestScore: bestClipScore(summary.bestRawScore),
        },
      ]),
    );
  }
}
