import type { GetProjectJobs } from "@/modules/jobs/application";
import type { ProjectWithJobs } from "./list-projects";
import type { ProjectRepository } from "./ports";

/** Satu proyek beserta sumber & job terbarunya per tipe; `null` bila tidak ada. */
export class GetProject {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly projectJobs: Pick<GetProjectJobs, "execute">,
  ) {}

  async execute(projectId: string): Promise<ProjectWithJobs | null> {
    const project = await this.projects.get(projectId);
    if (!project) return null;
    const jobs = await this.projectJobs.execute([project.id]);
    return { ...project, jobs: jobs.get(project.id) ?? [] };
  }
}
