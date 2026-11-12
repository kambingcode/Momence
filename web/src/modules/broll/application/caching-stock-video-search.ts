import type { StockSearchResult } from "@/shared/schemas";
import type { StockSearchQuery, StockVideoSearch } from "./search-stock-videos";

export interface Clock {
  now(): number;
}

/** Ketentuan Pixabay: hasil pencarian di-cache 24 jam. */
export const STOCK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Batas entri agar memori server tidak tumbuh tanpa batas. */
export const STOCK_CACHE_MAX_ENTRIES = 500;

interface Entry {
  at: number;
  result: StockSearchResult;
}

/**
 * Decorator `StockVideoSearch`: hasil yang sama (kueri tanpa beda huruf besar, orientasi,
 * halaman, jumlah per halaman) diambil dari memori selama `ttlMs`. Galat tidak di-cache. Bila
 * penuh, entri tertua dibuang.
 */
export class CachingStockVideoSearch implements StockVideoSearch {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly inner: StockVideoSearch,
    private readonly clock: Clock,
    private readonly ttlMs: number = STOCK_CACHE_TTL_MS,
    private readonly maxEntries: number = STOCK_CACHE_MAX_ENTRIES,
  ) {}

  async search(query: StockSearchQuery): Promise<StockSearchResult> {
    const key = JSON.stringify([
      query.query.toLowerCase(),
      query.orientation,
      query.page,
      query.perPage,
    ]);
    const now = this.clock.now();
    const cached = this.entries.get(key);
    if (cached && now - cached.at < this.ttlMs) return cached.result;

    const result = await this.inner.search(query);
    // Map menjaga urutan sisip: hapus dulu agar entri yang diperbarui jadi yang terbaru.
    this.entries.delete(key);
    this.entries.set(key, { at: now, result });
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(oldest);
    }
    return result;
  }
}
