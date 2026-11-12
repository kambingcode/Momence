import type { ByteRange } from "../domain/byte-range";
import type { Project, Source, SourceMedia } from "../domain/project";
import type { VideoExtension } from "../domain/video-file";

export type ProjectWithSource = Project & {
  source: (Source & SourceMedia) | null;
};

/** Hasil `deleteIfIdle`. */
export type ProjectDeletion =
  | { status: "deleted" }
  | { status: "not_found" }
  /** Ada job proyek yang sedang dikerjakan worker; tidak ada yang dihapus. */
  | { status: "busy"; jobType: string };

export interface ProjectRepository {
  /** Simpan proyek beserta video sumbernya dalam satu transaksi. */
  create(project: Project, source: Source): Promise<void>;
  delete(projectId: string): Promise<void>;
  /**
   * Hapus proyek beserta semua barisnya (sumber, transkrip, klip, job, …) dalam satu transaksi
   * tulis, kecuali ada job `running` dan `allowRunning` false. Pengecekan & penghapusan atomik:
   * worker tidak bisa mengklaim job proyek ini di antaranya.
   */
  deleteIfIdle(
    projectId: string,
    options: { allowRunning: boolean },
  ): Promise<ProjectDeletion>;
  get(projectId: string): Promise<ProjectWithSource | null>;
  /** Terbaru dulu. */
  list(limit: number): Promise<ProjectWithSource[]>;
}

/** Mengganti fokus klip proyek (arahan pemilihan klip untuk job `discover`). */
export interface ClipFocusStore {
  /** `false` bila proyek tidak ada. */
  setClipFocus(projectId: string, focus: string | null): Promise<boolean>;
}

export interface MediaStorage {
  /**
   * Tulis stream video sumber ke disk tanpa memuat seluruhnya ke memori.
   * Bila stream gagal/terputus, file setengah jadi dihapus dan error dilempar ulang.
   */
  saveSource(
    projectId: string,
    extension: VideoExtension,
    data: ReadableStream<Uint8Array>,
  ): Promise<{ path: string; sizeBytes: number }>;
  removeProject(projectId: string): Promise<void>;
  /** Ukuran file media dalam byte; `null` bila file tidak ada. */
  fileSize(relativePath: string): Promise<number | null>;
  /** Stream sebagian file (rentang byte inklusif) tanpa memuat seluruhnya ke memori. */
  readFile(relativePath: string, range: ByteRange): ReadableStream<Uint8Array>;
  /** Semua file di bawah `media/` beserta ukurannya. */
  listMediaFiles(): Promise<MediaFile[]>;
  /** Ruang disk tempat direktori data berada. */
  diskSpace(): Promise<DiskSpace>;
}

/** Satu file di bawah `media/`. */
export interface MediaFile {
  /** Nama folder langsung di bawah `media/` (= id proyek bila proyeknya ada). */
  projectId: string;
  /** Relatif terhadap folder proyek, format POSIX. */
  path: string;
  sizeBytes: number;
}

export interface DiskSpace {
  freeBytes: number;
  totalBytes: number;
}

export interface IdGenerator {
  next(): string;
}

export interface Clock {
  now(): number;
}

/** Apakah worker sedang berjalan (detak terbaru masih segar). */
export interface WorkerPresence {
  isOnline(): Promise<boolean>;
}
