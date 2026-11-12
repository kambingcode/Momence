import { count, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { clips } from "@/server/db/schema";
import { clipDetailsSchema } from "@/shared/schemas/clips";
import type { Clip, ClipRepository, ProjectClipSummary } from "../application";

// `rawScore` dari details tanpa mem-parse seluruh JSON (dashboard mem-polling daftar proyek).
// CASE bersarang: json_type hanya dievaluasi pada JSON yang valid (JSON rusak tidak menggagalkan
// kueri); nilai bukan angka diabaikan oleh max().
const rawScore = sql<
  number | null
>`max(case when json_valid(${clips.details}) then
  case when json_type(${clips.details}, '$.rawScore') in ('integer', 'real')
    then json_extract(${clips.details}, '$.rawScore') end end)`;

type ClipRow = typeof clips.$inferSelect;

// Ditulis worker (Python); divalidasi agar bentuk yang menyimpang ketahuan di sini.
function toClip(row: ClipRow): Clip {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    startMs: row.startMs,
    endMs: row.endMs,
    score: row.score,
    rank: row.rank,
    details: clipDetailsSchema.parse(row.details),
  };
}

export class DrizzleClipRepository implements ClipRepository {
  constructor(private readonly db: Database) {}

  async listByProject(projectId: string): Promise<Clip[]> {
    const rows = await this.db
      .select()
      .from(clips)
      .where(eq(clips.projectId, projectId));
    return rows.map(toClip);
  }

  async get(clipId: string): Promise<Clip | null> {
    const [row] = await this.db
      .select()
      .from(clips)
      .where(eq(clips.id, clipId))
      .limit(1);
    return row ? toClip(row) : null;
  }

  async summarizeByProject(
    projectIds: readonly string[],
  ): Promise<Map<string, ProjectClipSummary>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        projectId: clips.projectId,
        count: count(),
        bestRawScore: rawScore,
      })
      .from(clips)
      .where(inArray(clips.projectId, [...projectIds]))
      .groupBy(clips.projectId);
    return new Map(
      rows.map((row) => [
        row.projectId,
        { count: row.count, bestRawScore: row.bestRawScore },
      ]),
    );
  }
}
