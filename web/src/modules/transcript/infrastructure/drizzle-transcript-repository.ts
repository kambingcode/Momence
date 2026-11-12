import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/server/db/client";
import { transcripts } from "@/server/db/schema";
import {
  transcriptLanguageSchema,
  transcriptTokenSchema,
} from "@/shared/schemas/transcript";
import type { Transcript, TranscriptRepository } from "../application";

const tokensSchema = z.array(transcriptTokenSchema);

export class DrizzleTranscriptRepository implements TranscriptRepository {
  constructor(private readonly db: Database) {}

  async findByProject(projectId: string): Promise<Transcript | null> {
    const [row] = await this.db
      .select()
      .from(transcripts)
      .where(eq(transcripts.projectId, projectId))
      .limit(1);
    if (!row) return null;
    // Ditulis worker (Python); divalidasi agar bentuk yang menyimpang ketahuan di sini.
    return {
      id: row.id,
      projectId: row.projectId,
      sourceId: row.sourceId,
      language: transcriptLanguageSchema.nullable().parse(row.language),
      tokens: tokensSchema.parse(row.words),
    };
  }
}
