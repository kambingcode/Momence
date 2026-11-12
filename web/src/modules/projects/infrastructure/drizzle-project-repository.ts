import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { jobs, projects, sources } from "@/server/db/schema";
import type {
  ClipFocusStore,
  Project,
  ProjectDeletion,
  ProjectRepository,
  ProjectWithSource,
  Source,
} from "../application";

export class DrizzleProjectRepository
  implements ProjectRepository, ClipFocusStore
{
  constructor(private readonly db: Database) {}

  async create(project: Project, source: Source): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id: project.id,
        name: project.name,
        clipFocus: project.clipFocus ?? null,
        createdAt: project.createdAt,
        updatedAt: project.createdAt,
      });
      await tx.insert(sources).values({
        id: source.id,
        projectId: source.projectId,
        originalName: source.originalName,
        path: source.path,
        sizeBytes: source.sizeBytes,
        createdAt: project.createdAt,
      });
    });
  }

  async setClipFocus(
    projectId: string,
    focus: string | null,
  ): Promise<boolean> {
    const updated = await this.db
      .update(projects)
      .set({ clipFocus: focus, updatedAt: Date.now() })
      .where(eq(projects.id, projectId))
      .returning({ id: projects.id });
    return updated.length > 0;
  }

  async delete(projectId: string): Promise<void> {
    // sources & jobs ikut terhapus lewat ON DELETE CASCADE.
    await this.db.delete(projects).where(eq(projects.id, projectId));
  }

  async deleteIfIdle(
    projectId: string,
    { allowRunning }: { allowRunning: boolean },
  ): Promise<ProjectDeletion> {
    // Transaksi libsql = BEGIN IMMEDIATE (mode "write"; drizzle mengabaikan opsi `behavior`):
    // kunci tulis sejak awal, sehingga klaim job oleh worker (UPDATE) menunggu sampai transaksi
    // ini selesai dan tidak ada job yang mulai jalan di antara cek & hapus.
    return this.db.transaction(async (tx): Promise<ProjectDeletion> => {
      const [running] = await tx
        .select({ type: jobs.type })
        .from(jobs)
        .where(and(eq(jobs.projectId, projectId), eq(jobs.status, "running")))
        .limit(1);
      if (running && !allowRunning)
        return { status: "busy", jobType: running.type };
      const deleted = await tx
        .delete(projects)
        .where(eq(projects.id, projectId))
        .returning({ id: projects.id });
      return deleted.length > 0
        ? { status: "deleted" }
        : { status: "not_found" };
    });
  }

  async get(projectId: string): Promise<ProjectWithSource | null> {
    const [row] = await this.selectWithSource()
      .where(eq(projects.id, projectId))
      .limit(1);
    return row ? toProjectWithSource(row) : null;
  }

  async list(limit: number): Promise<ProjectWithSource[]> {
    const rows = await this.selectWithSource()
      .orderBy(desc(projects.createdAt))
      .limit(limit);
    return rows.map(toProjectWithSource);
  }

  private selectWithSource() {
    return this.db
      .select({ project: projects, source: sources })
      .from(projects)
      .leftJoin(sources, eq(sources.projectId, projects.id))
      .$dynamic();
  }
}

function toProjectWithSource({
  project,
  source,
}: {
  project: typeof projects.$inferSelect;
  source: typeof sources.$inferSelect | null;
}): ProjectWithSource {
  return {
    id: project.id,
    name: project.name,
    clipFocus: project.clipFocus,
    createdAt: project.createdAt,
    source: source && {
      id: source.id,
      projectId: source.projectId,
      originalName: source.originalName,
      path: source.path,
      sizeBytes: source.sizeBytes,
      durationMs: source.durationMs,
      width: source.width,
      height: source.height,
      proxyPath: source.proxyPath,
    },
  };
}
