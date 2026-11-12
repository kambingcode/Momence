import "server-only";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/**
 * Membuka DB dan menerapkan migrasi yang belum jalan. libsql sudah mengaktifkan
 * foreign_keys per koneksi; `timeout` = busy_timeout untuk semua koneksi di pool
 * (web & worker menulis ke file yang sama). WAL tersimpan permanen di file.
 */
export async function openDatabase(
  databaseUrl: string,
  dataDir: string,
): Promise<Database> {
  await mkdir(dataDir, { recursive: true });
  const client = createClient({ url: databaseUrl, timeout: 5000 });
  await client.execute("PRAGMA journal_mode = WAL");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}
