import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { startFakeGemini } from "./fake-gemini";
import { ensureVideos } from "./videos";

const WORKER_DIR = path.resolve(__dirname, "..", "..", "worker");

export function e2eDataDir(): string {
  const dir = process.env.CLIPSTUDIO_E2E_DATA_DIR;
  if (!dir)
    throw new Error(
      "CLIPSTUDIO_E2E_DATA_DIR belum di-set (playwright.config.ts)",
    );
  return dir;
}

export function fixturesDir(): string {
  return path.join(e2eDataDir(), "fixtures");
}

function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  return new Promise((resolve) => {
    const force = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    // Worker menyelesaikan job yang sedang jalan lalu berhenti.
    child.kill("SIGTERM");
  });
}

/** Tunggu worker siap (log `worker_mulai`); gagal start → galat berisi log-nya. */
async function waitUntilStarted(child: ChildProcess, logPath: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const log = await readFile(logPath, "utf8").catch(() => "");
    if (log.includes("worker_mulai")) return;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`Worker berhenti saat start:\n${log.slice(-2000)}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Worker belum siap setelah 120 dtk; lihat ${logPath}`);
}

/**
 * Dijalankan setelah server web e2e siap (DB sudah dimigrasi oleh request pertama): buat video
 * uji, nyalakan server Gemini palsu, lalu jalankan worker sungguhan pada data e2e.
 */
export default async function globalSetup() {
  const dataDir = e2eDataDir();
  ensureVideos(fixturesDir());
  const gemini = await startFakeGemini();
  const logPath = path.join(dataDir, "worker.log");
  const log = createWriteStream(logPath);
  const worker = spawn(
    "uv",
    ["run", "worker", "run", "--poll-interval", "0.5"],
    {
      cwd: WORKER_DIR,
      env: {
        ...process.env,
        CLIPSTUDIO_DATA_DIR: dataDir,
        // Log langsung ke file (tanpa buffer) agar start worker bisa dideteksi.
        PYTHONUNBUFFERED: "1",
        GOOGLE_GEMINI_BASE_URL: gemini.url,
        // Bukan key asli: key di worker/.env tidak pernah dikirim ke server palsu.
        GEMINI_API_KEY: "e2e-bukan-key-asli",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  worker.stdout?.pipe(log);
  worker.stderr?.pipe(log);

  const teardown = async () => {
    await stopProcess(worker);
    await gemini.close();
    if (process.env.CLIPSTUDIO_E2E_TEMP && !process.env.CLIPSTUDIO_E2E_KEEP)
      await rm(dataDir, { recursive: true, force: true });
    else console.log(`Data e2e disimpan di ${dataDir}`);
  };
  try {
    await waitUntilStarted(worker, logPath);
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
