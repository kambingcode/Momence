import type { EnqueueJob, Job } from "@/modules/jobs/application";
import type { IngestPayload } from "@/shared/schemas";
import type { Project, Source } from "../domain/project";
import {
  InvalidVideoFileError,
  projectNameFrom,
  videoExtensionOf,
} from "../domain/video-file";
import type {
  Clock,
  IdGenerator,
  MediaStorage,
  ProjectRepository,
} from "./ports";

export interface UploadVideoInput {
  filename: string;
  /** Arahan pemilihan klip (sudah dirapikan oleh `clipFocusSchema`). */
  clipFocus?: string | null;
  data: ReadableStream<Uint8Array>;
}

export interface UploadVideoResult {
  project: Project;
  source: Source;
  job: Job;
}

/** Simpan video unggahan sebagai proyek baru lalu antre job `ingest`. */
export class UploadVideo {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly storage: MediaStorage,
    private readonly enqueueJob: Pick<EnqueueJob, "execute">,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: UploadVideoInput): Promise<UploadVideoResult> {
    const extension = videoExtensionOf(input.filename);
    const projectId = this.ids.next();

    const saved = await this.storage.saveSource(
      projectId,
      extension,
      input.data,
    );
    if (saved.sizeBytes === 0) {
      await this.storage.removeProject(projectId);
      throw new InvalidVideoFileError("File kosong.");
    }

    const project: Project = {
      id: projectId,
      name: projectNameFrom(input.filename),
      clipFocus: input.clipFocus ?? null,
      createdAt: this.clock.now(),
    };
    const source: Source = {
      id: this.ids.next(),
      projectId,
      originalName: input.filename,
      path: saved.path,
      sizeBytes: saved.sizeBytes,
    };

    let created = false;
    try {
      await this.projects.create(project, source);
      created = true;
      const payload: IngestPayload = { sourceId: source.id };
      const job = await this.enqueueJob.execute({
        projectId,
        type: "ingest",
        payload,
      });
      return { project, source, job };
    } catch (error) {
      // Jangan tinggalkan proyek tanpa job ingest atau file tanpa proyek.
      if (created) await this.projects.delete(projectId);
      await this.storage.removeProject(projectId);
      throw error;
    }
  }
}
