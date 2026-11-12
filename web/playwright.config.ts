import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Data e2e terpisah per run (tidak pernah menyentuh data/ milik pengguna). Proses Playwright
// lain (worker tes) mewarisi env ini, sehingga semuanya memakai folder yang sama.
if (!process.env.CLIPSTUDIO_E2E_DATA_DIR) {
  process.env.CLIPSTUDIO_E2E_DATA_DIR = mkdtempSync(
    path.join(tmpdir(), "clipstudio-e2e-"),
  );
  // Hanya folder buatan sendiri yang dihapus setelah uji (global-setup.ts).
  process.env.CLIPSTUDIO_E2E_TEMP = "1";
}
// Port sendiri: server pengguna di 3000 tidak dipakai ulang.
const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Transkripsi Whisper + render Remotion; pertama kali juga mengunduh model & Chrome headless.
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"]],
  use: {
    baseURL,
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      testMatch: "clipstudio.spec.ts",
      // Chromium bawaan Playwright tidak bisa memutar H.264 (video proxy & pratinjau).
      use: { channel: "chrome" },
    },
    {
      // Perilaku Safari (butuh `npx playwright install webkit`); memakai data suite utama.
      name: "webkit",
      testMatch: "preview-webkit.spec.ts",
      use: { browserName: "webkit" },
      dependencies: ["chrome"],
    },
  ],
  webServer: {
    command: `npx next dev -H 127.0.0.1 -p ${PORT}`,
    // Request pertama juga menjalankan migrasi DB, sebelum global setup menyalakan worker.
    url: `${baseURL}/api/projects`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      CLIPSTUDIO_DATA_DIR: process.env.CLIPSTUDIO_E2E_DATA_DIR,
      CLIPSTUDIO_NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
