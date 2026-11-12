import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { clipReframes } from "@/server/db/schema";
import { cropTracksSchema } from "@/shared/schemas/reframe";
import type { ClipReframeRepository, StoredClipReframe } from "../application";

export class DrizzleClipReframeRepository implements ClipReframeRepository {
  constructor(private readonly db: Database) {}

  async findByClipId(clipId: string): Promise<StoredClipReframe | null> {
    const [row] = await this.db
      .select({
        startMs: clipReframes.startMs,
        endMs: clipReframes.endMs,
        crops: clipReframes.crops,
      })
      .from(clipReframes)
      .where(eq(clipReframes.clipId, clipId))
      .limit(1);
    if (!row) return null;
    // Crop rusak/berbentuk lama tidak boleh menggagalkan editor: anggap belum dihitung.
    const crops = cropTracksSchema.safeParse(row.crops);
    return {
      startMs: row.startMs,
      endMs: row.endMs,
      crops: crops.success ? crops.data : null,
    };
  }
}
