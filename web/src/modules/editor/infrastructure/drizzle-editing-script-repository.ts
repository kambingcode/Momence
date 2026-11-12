import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { editingScripts } from "@/server/db/schema";
import {
  type EditingScript,
  editingScriptSchema,
} from "@/shared/schemas/editing-script";
import type {
  EditingScriptRepository,
  SaveScriptOutcome,
  StoredEditingScript,
} from "../application";

type Row = typeof editingScripts.$inferSelect;

function toStored(row: Row): StoredEditingScript {
  return {
    clipId: row.clipId,
    version: row.version,
    script: editingScriptSchema.parse(row.script),
    updatedAt: row.updatedAt,
  };
}

export class DrizzleEditingScriptRepository implements EditingScriptRepository {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
  ) {}

  async get(clipId: string): Promise<StoredEditingScript | null> {
    const [row] = await this.db
      .select()
      .from(editingScripts)
      .where(eq(editingScripts.clipId, clipId))
      .limit(1);
    return row ? toStored(row) : null;
  }

  async save(
    clipId: string,
    script: EditingScript,
    expectedVersion: number | null,
  ): Promise<SaveScriptOutcome> {
    // Satu pernyataan per cabang → atomik tanpa transaksi; versi yang tidak cocok = 0 baris.
    const [row] =
      expectedVersion === null
        ? await this.db
            .insert(editingScripts)
            .values({
              id: randomUUID(),
              clipId,
              version: 1,
              script,
              updatedAt: this.now(),
            })
            .onConflictDoNothing({ target: editingScripts.clipId })
            .returning()
        : await this.db
            .update(editingScripts)
            .set({
              version: sql`${editingScripts.version} + 1`,
              script,
              updatedAt: this.now(),
            })
            .where(
              and(
                eq(editingScripts.clipId, clipId),
                eq(editingScripts.version, expectedVersion),
              ),
            )
            .returning();
    if (row) return { status: "saved", saved: toStored(row) };
    return { status: "conflict", current: await this.get(clipId) };
  }
}
