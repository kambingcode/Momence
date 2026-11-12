import type { AspectRatio, StockSearchResult } from "@/shared/schemas";
import {
  type Orientation as StockOrientation,
  orientationFirst,
} from "../domain/orientation";

export type { StockOrientation };

export interface StockSearchQuery {
  query: string;
  orientation: StockOrientation;
  page: number;
  perPage: number;
}

/**
 * Port pencarian video stok (adapter: Pixabay). `orientation` = orientasi yang diinginkan;
 * adapter yang tidak bisa memfilternya boleh mengabaikannya (use case mengurutkan hasil).
 */
export interface StockVideoSearch {
  search(query: StockSearchQuery): Promise<StockSearchResult>;
}

/** Pencarian gagal (jaringan, key ditolak, batas pemakaian); pesannya untuk pengguna. */
export class StockSearchError extends Error {}

export type SearchStockVideosResult =
  | { status: "ok"; result: StockSearchResult }
  | { status: "invalid"; message: string }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

export const STOCK_PAGE_SIZE = 12;
const MAX_QUERY_LENGTH = 100;

const ORIENTATION: Record<AspectRatio, StockOrientation> = {
  "9:16": "portrait",
  "1:1": "square",
  "16:9": "landscape",
};

/**
 * Cari video stok; yang orientasinya sama dengan rasio klip di depan (B-roll di-crop memenuhi
 * frame, jadi orientasi lain tetap bisa dipakai).
 */
export class SearchStockVideos {
  /** `search` null = key belum diisi. */
  constructor(private readonly search: StockVideoSearch | null) {}

  async execute(input: {
    query: string;
    aspectRatio: AspectRatio;
    page: number;
  }): Promise<SearchStockVideosResult> {
    const query = input.query.trim().replace(/\s+/g, " ");
    if (!query || query.length > MAX_QUERY_LENGTH)
      return {
        status: "invalid",
        message: `Kata kunci harus 1–${MAX_QUERY_LENGTH} karakter.`,
      };
    if (!this.search)
      return {
        status: "unavailable",
        message:
          "PIXABAY_API_KEY belum diisi di web/.env.local (gratis di pixabay.com/api/docs).",
      };
    try {
      const orientation = ORIENTATION[input.aspectRatio];
      const result = await this.search.search({
        query,
        orientation,
        page: input.page,
        perPage: STOCK_PAGE_SIZE,
      });
      return {
        status: "ok",
        result: {
          ...result,
          videos: orientationFirst(result.videos, orientation),
        },
      };
    } catch (error) {
      if (error instanceof StockSearchError)
        return { status: "error", message: error.message };
      throw error;
    }
  }
}
