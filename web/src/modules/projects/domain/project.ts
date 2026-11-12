export interface Project {
  id: string;
  name: string;
  /** Arahan pemilihan klip (maks. 500 karakter); `null`/tidak ada = tanpa fokus. */
  clipFocus?: string | null;
  /** Epoch milidetik. */
  createdAt: number;
}

/** Metadata video sumber; terisi setelah job ingest selesai. */
export interface SourceMedia {
  durationMs: number | null;
  width: number | null;
  height: number | null;
  /** Proxy 720p untuk pratinjau, relatif terhadap direktori data. */
  proxyPath: string | null;
}

export interface Source {
  id: string;
  projectId: string;
  originalName: string;
  /** Relatif terhadap direktori data. */
  path: string;
  sizeBytes: number;
}
