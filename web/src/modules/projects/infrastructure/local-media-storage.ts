import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  statfs,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type {
  ByteRange,
  DiskSpace,
  MediaFile,
  MediaStorage,
} from "../application";

const SAFE_ID = /^[A-Za-z0-9-]+$/;

// projectId menjadi nama folder; tolak apa pun yang bisa keluar dari folder media.
function assertSafeId(projectId: string): void {
  if (!SAFE_ID.test(projectId))
    throw new Error(`projectId tidak valid: ${projectId}`);
}

/** Media disimpan di `<dataDir>/media/<projectId>/`. */
export class LocalMediaStorage implements MediaStorage {
  constructor(private readonly dataDir: string) {}

  async saveSource(
    projectId: string,
    extension: string,
    data: ReadableStream<Uint8Array>,
  ): Promise<{ path: string; sizeBytes: number }> {
    assertSafeId(projectId);
    const relativePath = path.posix.join(
      "media",
      projectId,
      `source.${extension}`,
    );
    const finalPath = this.resolve(relativePath);
    const partPath = `${finalPath}.part`;
    await mkdir(path.dirname(finalPath), { recursive: true });

    try {
      // Stream langsung ke disk; memori tetap kecil walau file berukuran GB.
      await pipeline(
        Readable.fromWeb(data as NodeReadableStream<Uint8Array>),
        createWriteStream(partPath, { flags: "wx" }),
      );
      await rename(partPath, finalPath);
    } catch (error) {
      await this.removeProject(projectId);
      throw error;
    }
    const { size } = await stat(finalPath);
    return { path: relativePath, sizeBytes: size };
  }

  async removeProject(projectId: string): Promise<void> {
    assertSafeId(projectId);
    await rm(this.resolve(path.posix.join("media", projectId)), {
      recursive: true,
      force: true,
    });
  }

  async fileSize(relativePath: string): Promise<number | null> {
    try {
      const info = await stat(this.resolve(relativePath));
      return info.isFile() ? info.size : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  readFile(relativePath: string, range: ByteRange): ReadableStream<Uint8Array> {
    const stream = createReadStream(this.resolve(relativePath), range);
    return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  }

  async listMediaFiles(): Promise<MediaFile[]> {
    const media = path.join(this.dataDir, "media");
    let entries;
    try {
      entries = await readdir(media, { recursive: true, withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const files: MediaFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = path.join(entry.parentPath, entry.name);
      const [projectId, ...rest] = path.relative(media, full).split(path.sep);
      if (!projectId || rest.length === 0) continue;
      try {
        const { size } = await lstat(full);
        files.push({ projectId, path: rest.join("/"), sizeBytes: size });
      } catch (error) {
        // File bisa hilang di antara readdir & lstat (mis. .part yang baru di-rename).
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return files;
  }

  async diskSpace(): Promise<DiskSpace> {
    const info = await statfs(this.dataDir);
    return {
      freeBytes: info.bavail * info.bsize,
      totalBytes: info.blocks * info.bsize,
    };
  }

  private resolve(relativePath: string): string {
    const resolved = path.resolve(this.dataDir, ...relativePath.split("/"));
    // Path dari DB tetap dijaga agar tidak keluar dari direktori data.
    if (!resolved.startsWith(path.resolve(this.dataDir) + path.sep))
      throw new Error(`Path di luar direktori data: ${relativePath}`);
    return resolved;
  }
}
