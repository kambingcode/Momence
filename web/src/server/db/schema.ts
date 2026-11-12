import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Skema & migrasi milik web (drizzle-kit). Worker hanya membaca/menulis lewat SQLAlchemy Core
 * dengan definisi tabel yang mencerminkan file ini — ubah keduanya bersamaan.
 * Waktu disimpan sebagai epoch milidetik; kolom JSON disimpan sebagai teks.
 */
const createdAt = () =>
  integer("created_at")
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);
const updatedAt = () =>
  integer("updated_at")
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Arahan pengguna untuk pemilihan klip (job discover); null = tanpa fokus.
  clipFocus: text("clip_focus"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    originalName: text("original_name").notNull(),
    // Path relatif terhadap direktori data.
    path: text("path").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    fps: real("fps"),
    audioPath: text("audio_path"),
    proxyPath: text("proxy_path"),
    createdAt: createdAt(),
  },
  (t) => [index("sources_project_idx").on(t.projectId)],
);

export const transcripts = sqliteTable(
  "transcripts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    language: text("language"),
    words: text("words", { mode: "json" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("transcripts_source_idx").on(t.sourceId)],
);

export const clips = sqliteTable(
  "clips",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    score: integer("score"),
    rank: integer("rank"),
    details: text("details", { mode: "json" }),
    createdAt: createdAt(),
  },
  (t) => [index("clips_project_idx").on(t.projectId)],
);

export const editingScripts = sqliteTable("editing_scripts", {
  id: text("id").primaryKey(),
  clipId: text("clip_id")
    .notNull()
    .unique()
    .references(() => clips.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  script: text("script", { mode: "json" }).notNull(),
  updatedAt: updatedAt(),
});

/**
 * Hasil job `reframe` (worker) per klip untuk rentang `startMs`–`endMs`: `analysis` = wajah per
 * sampel & batas adegan (hanya dibaca worker), `crops` = jalur crop per rasio (skema
 * `cropTracksSchema`). `version` / `cropVersion` = versi algoritma deteksi / crop; rentang atau
 * versi berbeda → dihitung ulang.
 */
export const clipReframes = sqliteTable("clip_reframes", {
  clipId: text("clip_id")
    .primaryKey()
    .references(() => clips.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  analysis: text("analysis", { mode: "json" }).notNull(),
  cropVersion: integer("crop_version"),
  crops: text("crops", { mode: "json" }),
  updatedAt: updatedAt(),
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    status: text("status", {
      enum: ["queued", "running", "done", "failed"],
    })
      .notNull()
      .default("queued"),
    progress: integer("progress").notNull().default(0),
    payload: text("payload", { mode: "json" }).notNull(),
    result: text("result", { mode: "json" }),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
  },
  (t) => [
    index("jobs_queue_idx").on(t.status, t.createdAt),
    index("jobs_project_idx").on(t.projectId),
  ],
);

/**
 * Pengaturan sebagai pasangan kunci → JSON: `preferences` (halaman Settings; dibaca web & worker,
 * skema `storedPreferencesSchema`) dan `worker` (status yang dilaporkan worker,
 * `workerStatusSchema`). Kunci yang belum ada = nilai bawaan.
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: updatedAt(),
});
