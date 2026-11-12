import type { ClipStats, GetClipStats } from "@/modules/clips/application";
import type { GetProjectJobs, Job } from "@/modules/jobs/application";
import type { ProjectRepository, ProjectWithSource } from "./ports";

export type ProjectWithJobs = ProjectWithSource & {
  /** Job terbaru per tipe (ingest, transcribe, …), urut waktu dibuat. */
  jobs: Job[];
};

export type ProjectListItem = ProjectWithJobs & {
  clips: ClipStats;
  /** Aktivitas terakhir: perubahan job terbaru, atau waktu dibuat bila belum ada job. */
  updatedAt: number;
};

export const PROJECT_LIST_LIMIT = 100;

const NO_CLIPS: ClipStats = { count: 0, bestScore: null };

export class ListProjects {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly projectJobs: Pick<GetProjectJobs, "execute">,
    private readonly clipStats: Pick<GetClipStats, "execute">,
  ) {}

  async execute(): Promise<ProjectListItem[]> {
    const projects = await this.projects.list(PROJECT_LIST_LIMIT);
    const ids = projects.map((p) => p.id);
    const [jobs, clips] = await Promise.all([
      this.projectJobs.execute(ids),
      this.clipStats.execute(ids),
    ]);
    return projects.map((project) => {
      const projectJobs = jobs.get(project.id) ?? [];
      return {
        ...project,
        jobs: projectJobs,
        clips: clips.get(project.id) ?? NO_CLIPS,
        updatedAt: Math.max(
          project.createdAt,
          ...projectJobs.map((job) => job.updatedAt),
        ),
      };
    });
  }
}
