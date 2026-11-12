import "server-only";
import path from "node:path";

/** Satu-satunya tempat membaca env di web; hasilnya disuntikkan lewat container. */
export interface AppConfig {
  dataDir: string;
  databaseUrl: string;
  /** Key Pixabay API (video stok B-roll); `null` = belum diisi di web/.env.local. */
  pixabayApiKey: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(
    env.CLIPSTUDIO_DATA_DIR ?? path.join(process.cwd(), "..", "data"),
  );
  return {
    dataDir,
    databaseUrl:
      env.DATABASE_URL ?? `file:${path.join(dataDir, "clipstudio.db")}`,
    pixabayApiKey: env.PIXABAY_API_KEY?.trim() || null,
  };
}
