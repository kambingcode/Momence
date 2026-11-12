/** Pemakaian disk per proyek, dikelompokkan menurut jenis file di `media/<proyek>/`. */
export const STORAGE_CATEGORIES = [
  "source",
  "proxy",
  "audio",
  "renders",
  "other",
] as const;
export type StorageCategory = (typeof STORAGE_CATEGORIES)[number];

export type StorageUsage = Record<StorageCategory, number> & { total: number };

/** `path` relatif terhadap folder proyek, format POSIX (mis. `renders/j1.mp4`). */
export function categoryOf(path: string): StorageCategory {
  const name = path.split("/").pop() ?? "";
  // File sementara (`.part`) dari unggahan/ffmpeg/Remotion yang belum selesai atau terputus.
  if (/\.part(\.[A-Za-z0-9]+)?$/.test(name)) return "other";
  if (path.startsWith("renders/")) return "renders";
  if (path === "proxy.mp4") return "proxy";
  if (path === "audio.wav") return "audio";
  if (/^source\.[A-Za-z0-9]+$/.test(path)) return "source";
  return "other";
}

export function emptyUsage(): StorageUsage {
  return { source: 0, proxy: 0, audio: 0, renders: 0, other: 0, total: 0 };
}

export function addFile(usage: StorageUsage, path: string, size: number): void {
  usage[categoryOf(path)] += size;
  usage.total += size;
}
