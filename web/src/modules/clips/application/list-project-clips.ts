import { sortClips } from "../domain/order";
import type { Clip, ClipRepository } from "./ports";

/** Semua klip proyek, urut peringkat (terbaik dulu). */
export class ListProjectClips {
  constructor(private readonly clips: ClipRepository) {}

  async execute(projectId: string): Promise<Clip[]> {
    return sortClips(await this.clips.listByProject(projectId), "score");
  }
}
