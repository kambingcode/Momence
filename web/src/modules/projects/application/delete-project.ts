import type {
  MediaStorage,
  ProjectDeletion,
  ProjectRepository,
  WorkerPresence,
} from "./ports";

/**
 * Hapus proyek: baris DB dulu (sumber, transkrip, klip, editan, job ikut lewat ON DELETE
 * CASCADE), lalu seluruh folder `media/<id>/` (sumber, audio, proxy, render, sisa `.part`).
 *
 * Ditolak selama worker mengerjakan job proyek ini: job itu masih menulis ke folder proyek
 * (mis. render membuat ulang `renders/`). Bila worker tidak berdetak, job `running` dianggap
 * ditinggalkan dan proyek tetap dihapus — worker yang nanti jalan lagi tidak menemukan job-nya.
 */
export class DeleteProject {
  constructor(
    private readonly projects: Pick<ProjectRepository, "deleteIfIdle">,
    private readonly storage: Pick<MediaStorage, "removeProject">,
    private readonly worker: WorkerPresence,
  ) {}

  async execute(projectId: string): Promise<ProjectDeletion> {
    const allowRunning = !(await this.worker.isOnline());
    const result = await this.projects.deleteIfIdle(projectId, {
      allowRunning,
    });
    // Hanya setelah barisnya terhapus: folder tanpa baris bisa milik unggahan yang sedang
    // berjalan (UploadVideo menulis file sebelum membuat proyek).
    if (result.status === "deleted")
      await this.storage.removeProject(projectId);
    return result;
  }
}
