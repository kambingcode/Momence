import type { EditingScript } from "@/shared/schemas/editing-script";
import type {
  EditingScriptRepository,
  SaveScriptOutcome,
  StoredEditingScript,
} from "./ports";

/** Fake untuk tes use case. */
export class InMemoryEditingScriptRepository implements EditingScriptRepository {
  readonly rows = new Map<string, StoredEditingScript>();

  constructor(private readonly now: () => number = () => 1_000) {}

  async get(clipId: string): Promise<StoredEditingScript | null> {
    return this.rows.get(clipId) ?? null;
  }

  async save(
    clipId: string,
    script: EditingScript,
    expectedVersion: number | null,
  ): Promise<SaveScriptOutcome> {
    const current = this.rows.get(clipId) ?? null;
    if ((current?.version ?? null) !== expectedVersion)
      return { status: "conflict", current };
    const saved = {
      clipId,
      version: (current?.version ?? 0) + 1,
      script,
      updatedAt: this.now(),
    };
    this.rows.set(clipId, saved);
    return { status: "saved", saved };
  }
}
