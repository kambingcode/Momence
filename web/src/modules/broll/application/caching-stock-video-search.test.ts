import { describe, expect, it } from "vitest";
import type { StockSearchResult } from "@/shared/schemas";
import {
  CachingStockVideoSearch,
  STOCK_CACHE_TTL_MS,
} from "./caching-stock-video-search";
import type { StockSearchQuery } from "./search-stock-videos";

function setup(maxEntries?: number) {
  let now = 0;
  const calls: StockSearchQuery[] = [];
  let fail = false;
  const cache = new CachingStockVideoSearch(
    {
      search: async (query): Promise<StockSearchResult> => {
        calls.push(query);
        if (fail) throw new Error("gagal");
        return { videos: [], page: query.page, hasMore: calls.length > 0 };
      },
    },
    { now: () => now },
    undefined,
    maxEntries,
  );
  return {
    cache,
    calls,
    advance: (ms: number) => (now += ms),
    failNext: (value: boolean) => (fail = value),
  };
}

const query = (q: string, page = 1): StockSearchQuery => ({
  query: q,
  orientation: "portrait",
  page,
  perPage: 12,
});

describe("CachingStockVideoSearch", () => {
  it("hasil sama diambil dari cache selama 24 jam (tanpa beda huruf besar)", async () => {
    const { cache, calls, advance } = setup();
    const first = await cache.search(query("Ocean"));
    advance(STOCK_CACHE_TTL_MS - 1);
    expect(await cache.search(query("ocean"))).toBe(first);
    expect(calls).toHaveLength(1);
    advance(1);
    await cache.search(query("ocean"));
    expect(calls).toHaveLength(2);
  });

  it("kueri, halaman, atau orientasi berbeda = entri berbeda", async () => {
    const { cache, calls } = setup();
    await cache.search(query("ocean"));
    await cache.search(query("ocean", 2));
    await cache.search({ ...query("ocean"), orientation: "landscape" });
    await cache.search(query("sea"));
    expect(calls).toHaveLength(4);
  });

  it("galat tidak di-cache", async () => {
    const { cache, calls, failNext } = setup();
    failNext(true);
    await expect(cache.search(query("ocean"))).rejects.toThrow("gagal");
    failNext(false);
    await cache.search(query("ocean"));
    await cache.search(query("ocean"));
    expect(calls).toHaveLength(2);
  });

  it("penuh → entri tertua dibuang", async () => {
    const { cache, calls } = setup(2);
    await cache.search(query("a"));
    await cache.search(query("b"));
    await cache.search(query("c"));
    await cache.search(query("b"));
    expect(calls).toHaveLength(3);
    await cache.search(query("a"));
    expect(calls.map((q) => q.query)).toEqual(["a", "b", "c", "a"]);
  });
});
