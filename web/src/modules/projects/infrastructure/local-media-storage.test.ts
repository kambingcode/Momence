import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalMediaStorage } from "./local-media-storage";

describe("LocalMediaStorage", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "clipstudio-media-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("menulis stream ke media/<projectId>/source.<ext>", async () => {
    const storage = new LocalMediaStorage(dir);
    const data = new Blob(["halo ", "dunia"]).stream();
    const saved = await storage.saveSource("p1", "mp4", data);

    expect(saved).toEqual({ path: "media/p1/source.mp4", sizeBytes: 10 });
    expect(
      await readFile(path.join(dir, "media", "p1", "source.mp4"), "utf8"),
    ).toBe("halo dunia");
  });

  it("menghapus file setengah jadi bila stream terputus", async () => {
    const storage = new LocalMediaStorage(dir);
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024));
        controller.error(new Error("koneksi putus"));
      },
    });
    await expect(storage.saveSource("p2", "mov", broken)).rejects.toThrow(
      "koneksi putus",
    );
    expect(await readdir(path.join(dir, "media"))).toEqual([]);
  });

  it("menolak projectId yang bisa keluar dari folder media", async () => {
    const storage = new LocalMediaStorage(dir);
    await expect(storage.removeProject("../..")).rejects.toThrow(
      "projectId tidak valid",
    );
  });

  it("membaca ukuran & rentang byte file media", async () => {
    await mkdir(path.join(dir, "media", "p3"), { recursive: true });
    await writeFile(path.join(dir, "media", "p3", "proxy.mp4"), "0123456789");
    const storage = new LocalMediaStorage(dir);

    expect(await storage.fileSize("media/p3/proxy.mp4")).toBe(10);
    expect(await storage.fileSize("media/p3/tidak-ada.mp4")).toBeNull();
    const text = await new Response(
      storage.readFile("media/p3/proxy.mp4", { start: 2, end: 5 }),
    ).text();
    expect(text).toBe("2345");
  });

  it("menolak path di luar direktori data", async () => {
    const storage = new LocalMediaStorage(path.join(dir, "data"));
    await expect(storage.fileSize("../rahasia.txt")).rejects.toThrow(
      "di luar direktori data",
    );
    expect(() =>
      storage.readFile("../../etc/passwd", { start: 0, end: 1 }),
    ).toThrow("di luar direktori data");
  });

  it("mendaftar semua file media per proyek & membaca sisa disk", async () => {
    const storage = new LocalMediaStorage(dir);
    expect(await storage.listMediaFiles()).toEqual([]);
    await mkdir(path.join(dir, "media", "p1", "renders"), { recursive: true });
    await writeFile(path.join(dir, "media", "p1", "source.mp4"), "12345");
    await writeFile(path.join(dir, "media", "p1", "renders", "j1.mp4"), "12");
    await writeFile(path.join(dir, "clipstudio.db"), "db");

    const files = await storage.listMediaFiles();
    expect(files.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { projectId: "p1", path: "renders/j1.mp4", sizeBytes: 2 },
      { projectId: "p1", path: "source.mp4", sizeBytes: 5 },
    ]);
    const disk = await storage.diskSpace();
    expect(disk.totalBytes).toBeGreaterThan(disk.freeBytes);
    expect(disk.freeBytes).toBeGreaterThan(0);
  });
});
