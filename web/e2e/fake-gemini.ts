import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Server Gemini API palsu untuk e2e (worker diarahkan ke sini lewat `GOOGLE_GEMINI_BASE_URL`):
 * pipeline discover asli — prompt, structured output, skor, penyimpanan — teruji tanpa biaya,
 * tanpa internet, dan hasilnya pasti. Setiap permintaan dijawab dengan klip dari transkrip yang
 * dikirim: dua klip (paruh awal & akhir) bila masing-masing ≥ 15 dtk, selain itu satu klip utuh.
 * Bila pesan memuat blok `<fokus_pengguna>`, hanya klip pertama yang dikembalikan dan judulnya
 * diawali "Fokus: " (supaya e2e bisa membuktikan fokus sampai ke Gemini).
 *
 * Permintaan caption & hashtag (job `post-copy`) dikenali dari instruksi penutupnya dan dijawab
 * caption yang memuat judul klip, platform, dan bahasa yang diminta, plus hashtag yang sengaja
 * kotor (duplikat, tanpa `#`, angka saja) supaya perapian di worker ikut teruji.
 */
const FOCUS_TITLE_PREFIX = "Fokus: ";

interface Sentence {
  number: number;
  startS: number;
  endS: number;
  text: string;
}

// Baris transkrip worker: `[nomor] (mm:ss–mm:ss) teks` (format_window di gemini_clip_suggester).
const SENTENCE = /^\[(\d+)\] \((\d+):(\d+)–(\d+):(\d+)\) (.*)$/;
const MIN_CLIP_S = 17; // 15 dtk + galat pembulatan cap waktu per detik

function parseSentences(prompt: string): Sentence[] {
  return prompt.split("\n").flatMap((line) => {
    const m = SENTENCE.exec(line);
    if (!m) return [];
    const [, n, sm, ss, em, es, text] = m;
    return [
      {
        number: Number(n),
        startS: Number(sm) * 60 + Number(ss),
        endS: Number(em) * 60 + Number(es),
        text: text!,
      },
    ];
  });
}

function pickRanges(sentences: Sentence[]): [Sentence, Sentence][] {
  const first = sentences[0];
  const last = sentences.at(-1);
  if (!first || !last) return [];
  for (let k = 0; k < sentences.length - 1; k++) {
    const head = sentences[k]!;
    const next = sentences[k + 1]!;
    if (
      head.endS - first.startS >= MIN_CLIP_S &&
      last.endS - next.startS >= MIN_CLIP_S
    )
      return [
        [first, head],
        [next, last],
      ];
  }
  const total = last.endS - first.startS;
  return total >= MIN_CLIP_S && total <= 88 ? [[first, last]] : [];
}

function subscore(score: number) {
  return { score, comment: `Skor uji ${score}.` };
}

export function suggestClips(prompt: string) {
  const focused = prompt.includes("<fokus_pengguna>");
  const ranges = pickRanges(parseSentences(prompt));
  return {
    clips: (focused ? ranges.slice(0, 1) : ranges).map(([start, end], i) => ({
      start_sentence: start.number,
      end_sentence: end.number,
      title: (focused ? FOCUS_TITLE_PREFIX : "") + start.text.slice(0, 60),
      hook: start.text.slice(0, 90),
      keywords: start.text
        .split(/\s+/)
        .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
        .filter((w) => w.length > 4)
        .slice(0, 3),
      // Klip pertama lebih tinggi → peringkat 1.
      hook_score: subscore(8 - i),
      flow_score: subscore(7),
      value_score: subscore(7 - i),
      trend_score: subscore(6),
    })),
  };
}

const POST_COPY_MARKER = "Tulis caption dan hashtag untuk klip di atas";

const PLATFORM_NAMES = ["TikTok", "Instagram Reels", "YouTube Shorts"];

export function writePostCopy(prompt: string) {
  const title = /^Judul klip: (.*)$/m.exec(prompt)?.[1] ?? "";
  const platform = PLATFORM_NAMES.find((name) => prompt.includes(name)) ?? "?";
  const language = prompt.includes("dalam English") ? "en" : "auto";
  return {
    caption: `Caption uji ${platform} [${language}]: ${title} #tidakboleh`,
    alt_caption: `Varian uji untuk ${title}`,
    hashtags: ["#E2E", "e2e", "Klip Uji", "2026", "#tips"],
  };
}

interface GenerateContentRequest {
  contents?: { parts?: { text?: string }[] }[];
}

function promptOf(body: GenerateContentRequest): string {
  return (body.contents ?? [])
    .flatMap((c) => (c.parts ?? []).map((p) => p.text ?? ""))
    .join("\n");
}

// `POST /v1beta/models/<model>:generateContent` (SDK google-genai, API Gemini Developer).
const GENERATE = /^\/v1beta\/models\/([^/:]+):generateContent(?:\?|$)/;

function sendError(
  res: ServerResponse,
  code: number,
  status: string,
  message: string,
) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { code, status, message } }));
}

function respondTo(prompt: string) {
  return prompt.includes(POST_COPY_MARKER)
    ? writePostCopy(prompt)
    : suggestClips(prompt);
}

export async function startFakeGemini(): Promise<{
  url: string;
  requests: () => number;
  close: () => Promise<void>;
}> {
  let count = 0;
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString("utf8")));
    req.on("end", () => {
      const match = req.method === "POST" ? GENERATE.exec(req.url ?? "") : null;
      if (!match) {
        sendError(res, 404, "NOT_FOUND", "e2e");
        return;
      }
      count++;
      let body: GenerateContentRequest;
      try {
        body = JSON.parse(raw) as GenerateContentRequest;
      } catch {
        sendError(res, 400, "INVALID_ARGUMENT", "JSON rusak");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: "model",
                parts: [{ text: JSON.stringify(respondTo(promptOf(body))) }],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
          modelVersion: match[1],
          responseId: `resp_e2e_${count}`,
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => count,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
