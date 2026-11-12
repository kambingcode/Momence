import path from "node:path";
import { defineConfig } from "drizzle-kit";

const dataDir = path.resolve(
  process.env.CLIPSTUDIO_DATA_DIR ?? path.join(__dirname, "..", "data"),
);

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? `file:${path.join(dataDir, "clipstudio.db")}`,
  },
});
