import type { EnqueueJob, Job } from "@/modules/jobs/application";
import type {
  DownloadAudioPayload,
  DownloadPayload,
  DownloadResolution,
} from "@/shared/schemas";
import type { Project, Source } from "../domain/project";
import { PLATFORM_LABELS, parseVideoUrl } from "../domain/video-url";
import type { Clock, IdGenerator, ProjectRepository } from "./ports";

export interface ImportVideoFromUrlResult {
  project: Project;
  source: Source;
  /** Unduhan video penuh (menyusul ingest). */
  job: Job;
  /** Unduhan audio saja (menyusul transkripsi & pencarian klip). */
  audioJob: Job;
}

/**
 * Buat proyek dari link YouTube atau VOD Twitch lalu antre dua job yang berjalan bersamaan di
 * worker: `download-audio` (suara saja, cepat → mengantre `transcribe`, sehingga klip bisa ditemukan
 * selagi video diunduh) dan `download` (video penuh ke `source.path` → `ingest`). Worker mengganti
 * nama proyek dengan judul video.
 */
export class ImportVideoFromUrl {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly enqueueJob: Pick<EnqueueJob, "execute">,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    url: string;
    clipFocus?: string | null;
    maxResolution?: DownloadResolution;
  }): Promise<ImportVideoFromUrlResult> {
    const video = parseVideoUrl(input.url);
    const projectId = this.ids.next();

    const project: Project = {
      id: projectId,
      name: `${PLATFORM_LABELS[video.platform]} ${video.videoId}`,
      clipFocus: input.clipFocus ?? null,
      createdAt: this.clock.now(),
    };
    // Ukuran & nama asli diisi worker setelah unduhan selesai.
    const source: Source = {
      id: this.ids.next(),
      projectId,
      originalName: video.url,
      path: `media/${projectId}/source.mp4`,
      sizeBytes: 0,
    };

    let created = false;
    try {
      await this.projects.create(project, source);
      created = true;
      const audioPayload: DownloadAudioPayload = {
        sourceId: source.id,
        url: video.url,
      };
      const audioJob = await this.enqueueJob.execute({
        projectId,
        type: "download-audio",
        payload: audioPayload,
      });
      const payload: DownloadPayload = {
        sourceId: source.id,
        url: video.url,
        audioFirst: true,
        ...(input.maxResolution ? { maxResolution: input.maxResolution } : {}),
      };
      const job = await this.enqueueJob.execute({
        projectId,
        type: "download",
        payload,
      });
      return { project, source, job, audioJob };
    } catch (error) {
      // Jangan tinggalkan proyek tanpa job unduhan (belum ada file yang ditulis).
      if (created) await this.projects.delete(projectId);
      throw error;
    }
  }
}
