import { z } from "zod";
import type { StockSearchResult, StockVideo } from "@/shared/schemas";
import {
  pickVideoFile,
  PREVIEW_SHORT_SIDE,
  RENDER_SHORT_SIDE,
  type StockSearchQuery,
  StockSearchError,
  type StockVideoSearch,
} from "../application";

export const PIXABAY_VIDEOS_URL = "https://pixabay.com/api/videos/";

// Ukuran yang tidak tersedia berisi url "" & size 0 → dilewati saat memilih file.
const fileSchema = z.object({
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  size: z.number(),
  thumbnail: z.string().optional(),
});
const hitSchema = z.object({
  id: z.number().int(),
  pageURL: z.string().url(),
  duration: z.number().min(0),
  user: z.string(),
  videos: z.object({
    large: fileSchema.optional(),
    medium: fileSchema.optional(),
    small: fileSchema.optional(),
    tiny: fileSchema.optional(),
  }),
});
const responseSchema = z.object({
  totalHits: z.number().int().min(0),
  hits: z.array(z.unknown()),
});

type FetchLike = (
  input: string,
  init: { signal: AbortSignal },
) => Promise<Response>;

const TIMEOUT_MS = 15_000;

const isUrl = (value: string | undefined): value is string =>
  !!value && z.string().url().safeParse(value).success;

function toStockVideo(raw: unknown): StockVideo | null {
  const parsed = hitSchema.safeParse(raw);
  if (!parsed.success) return null;
  const hit = parsed.data;
  // Semua file video Pixabay berformat MP4.
  const files = Object.values(hit.videos)
    .filter(
      (f) =>
        f !== undefined &&
        f.size > 0 &&
        f.width > 0 &&
        f.height > 0 &&
        isUrl(f.url),
    )
    .map((f) => ({
      width: f.width,
      height: f.height,
      fileType: "video/mp4",
      link: f.url,
    }));
  const render = pickVideoFile(files, RENDER_SHORT_SIDE);
  const preview = pickVideoFile(files, PREVIEW_SHORT_SIDE);
  const thumbnail = [
    hit.videos.medium,
    hit.videos.small,
    hit.videos.large,
    hit.videos.tiny,
  ]
    .map((f) => f?.thumbnail)
    .find(isUrl);
  if (!render || !preview || !thumbnail) return null;
  return {
    id: hit.id,
    // Ukuran file render (untuk mengurutkan orientasi); rasionya sama dengan video asli.
    width: render.width,
    height: render.height,
    durationMs: Math.round(hit.duration * 1000),
    pageUrl: hit.pageURL,
    thumbnailUrl: thumbnail,
    author: hit.user,
    url: render.link,
    previewUrl: preview.link,
  };
}

/**
 * Adapter `StockVideoSearch` ke Pixabay Videos API. Pixabay tidak bisa memfilter orientasi
 * video (`query.orientation` diabaikan; use case mengurutkan hasil). Key ada di query string,
 * jadi URL request tidak pernah dicatat atau dimasukkan ke pesan galat.
 */
export class PixabayVideoSearch implements StockVideoSearch {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async search(query: StockSearchQuery): Promise<StockSearchResult> {
    const url = new URL(PIXABAY_VIDEOS_URL);
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("q", query.query);
    // Rekaman nyata (bukan animasi), aman untuk semua penonton.
    url.searchParams.set("video_type", "film");
    url.searchParams.set("safesearch", "true");
    url.searchParams.set("page", String(query.page));
    url.searchParams.set("per_page", String(query.perPage));
    let response: Response;
    try {
      response = await this.fetchFn(url.toString(), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new StockSearchError(
        "Tidak bisa terhubung ke Pixabay. Periksa koneksi internet.",
      );
    }
    if (response.status === 429)
      throw new StockSearchError(
        "Batas pencarian Pixabay tercapai (100 per menit). Coba lagi sebentar lagi.",
      );
    if ([400, 401, 403].includes(response.status))
      throw new StockSearchError(
        "Pixabay menolak permintaan. Periksa PIXABAY_API_KEY di web/.env.local.",
      );
    if (!response.ok)
      throw new StockSearchError(`Pixabay gagal (${response.status}).`);
    const body = responseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!body.success)
      throw new StockSearchError("Jawaban Pixabay tidak sesuai format.");
    return {
      videos: body.data.hits
        .map(toStockVideo)
        .filter((v): v is StockVideo => v !== null),
      page: query.page,
      // Halaman di luar `totalHits` ditolak Pixabay (400).
      hasMore: query.page * query.perPage < body.data.totalHits,
    };
  }
}
