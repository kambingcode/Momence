/**
 * Render satu klip ke MP4 dengan Remotion. Dijalankan worker untuk job `render`:
 *
 *   node scripts/render-clip.mts < request.json
 *
 * Request (stdin, JSON): `{ sourcePath, outputPath, props }` — path absolut, `outputPath` berakhiran
 * `.mp4`; `props` = props komposisi `clip` tanpa `src`. Stdout: satu objek JSON per baris,
 * `{"stage":"browser"|"bundle"|"render","progress":0..1}` (naik ≥ 1% per baris); baris lain
 * (mis. log unduhan Chrome) boleh muncul dan diabaikan pembaca. Gagal → pesan di stderr, exit ≠ 0.
 */
import { createReadStream, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import {
  ensureBrowser,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";

const WEB_ROOT = path.resolve(import.meta.dirname, "..");
const ENTRY_POINT = path.join(WEB_ROOT, "src/remotion/index.ts");
// Sama dengan CLIP_COMPOSITION_ID di src/remotion/root.tsx.
const COMPOSITION_ID = "clip";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};

interface RenderRequest {
  sourcePath: string;
  outputPath: string;
  props: Record<string, unknown>;
}

type Stage = "browser" | "bundle" | "render";

const lastEmitted = new Map<Stage, number>();

/** Tulis progres per tahap, hanya bila naik ≥ 1% (unduhan Chrome melapor ribuan kali). */
function emit(stage: Stage, progress: number): void {
  const value = Math.floor(Math.min(1, Math.max(0, progress)) * 100) / 100;
  if (lastEmitted.has(stage) && value <= lastEmitted.get(stage)!) return;
  lastEmitted.set(stage, value);
  process.stdout.write(`${JSON.stringify({ stage, progress: value })}\n`);
}

async function readRequest(): Promise<RenderRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8")) as
    Partial<RenderRequest> | undefined;
  if (
    typeof request?.sourcePath !== "string" ||
    typeof request.outputPath !== "string" ||
    typeof request.props !== "object" ||
    request.props === null
  )
    throw new Error("Permintaan render tidak lengkap.");
  return request as RenderRequest;
}

/** Rentang byte dari header Range (satu rentang); `null` = seluruh file. */
function byteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start > end || start >= size ? "unsatisfiable" : { start, end };
}

/**
 * Sajikan video sumber lewat HTTP lokal (127.0.0.1, port acak) dengan dukungan Range:
 * `<OffthreadVideo>` hanya menerima URL, dan file sumber bisa berukuran GB sehingga tidak disalin.
 */
async function serveFile(
  file: string,
): Promise<{ url: string; close: () => void }> {
  const size = statSync(file).size;
  const type =
    CONTENT_TYPES[path.extname(file).toLowerCase()] ??
    "application/octet-stream";
  const server = http.createServer((request, response) => {
    const range = byteRange(request.headers.range, size);
    if (range === "unsatisfiable") {
      response.writeHead(416, { "Content-Range": `bytes */${size}` });
      response.end();
      return;
    }
    const { start, end } = range ?? { start: 0, end: size - 1 };
    response.writeHead(range ? 206 : 200, {
      "Content-Type": type,
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      ...(range && { "Content-Range": `bytes ${start}-${end}/${size}` }),
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(file, { start, end }).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const name = encodeURIComponent(path.basename(file));
  return {
    url: `http://127.0.0.1:${port}/${name}`,
    close: () => server.close(),
  };
}

async function main(): Promise<void> {
  const request = await readRequest();
  // Chrome headless untuk render diunduh sekali (±100 MB) saat pertama dipakai.
  await ensureBrowser({
    onBrowserDownload: () => ({
      version: null,
      onProgress: ({ percent }) => emit("browser", percent),
    }),
  });

  const video = await serveFile(request.sourcePath);
  const outDir = await mkdtemp(path.join(os.tmpdir(), "clipstudio-bundle-"));
  try {
    const serveUrl = await bundle({
      entryPoint: ENTRY_POINT,
      outDir,
      onProgress: (percent) => emit("bundle", percent / 100),
      // Alias impor `@/…` sama dengan tsconfig web.
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          alias: {
            ...(config.resolve?.alias as Record<string, string> | undefined),
            "@": path.join(WEB_ROOT, "src"),
          },
        },
      }),
    });
    const inputProps = { ...request.props, src: video.url };
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });
    await renderMedia({
      composition,
      serveUrl,
      inputProps,
      codec: "h264",
      outputLocation: request.outputPath,
      overwrite: true,
      onProgress: ({ progress }) => emit("render", progress),
    });
  } finally {
    video.close();
    await rm(outDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
