import { addFile, emptyUsage, type StorageUsage } from "../domain/storage";
import type { DiskSpace, MediaStorage } from "./ports";

export interface StorageOverview {
  /** Per folder `media/<id>`; folder tanpa proyek ikut terhitung (dibersihkan worker). */
  projects: Record<string, StorageUsage>;
  /** Seluruh folder media. */
  total: StorageUsage;
  disk: DiskSpace;
}

/** Pemakaian disk ClipStudio per proyek & total, plus sisa ruang disk. */
export class GetStorageOverview {
  constructor(
    private readonly storage: Pick<
      MediaStorage,
      "listMediaFiles" | "diskSpace"
    >,
  ) {}

  async execute(): Promise<StorageOverview> {
    const [files, disk] = await Promise.all([
      this.storage.listMediaFiles(),
      this.storage.diskSpace(),
    ]);
    const projects: Record<string, StorageUsage> = {};
    const total = emptyUsage();
    for (const file of files) {
      addFile(
        (projects[file.projectId] ??= emptyUsage()),
        file.path,
        file.sizeBytes,
      );
      addFile(total, file.path, file.sizeBytes);
    }
    return { projects, total, disk };
  }
}
