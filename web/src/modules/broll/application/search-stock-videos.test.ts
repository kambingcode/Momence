import { describe, expect, it } from "vitest";
import {
  type StockSearchQuery,
  SearchStockVideos,
  StockSearchError,
  type StockVideoSearch,
} from "./search-stock-videos";

function fakeSearch(error?: Error) {
  const queries: StockSearchQuery[] = [];
  const search: StockVideoSearch = {
    search: async (query) => {
      queries.push(query);
      if (error) throw error;
      return { videos: [], page: query.page, hasMore: false };
    },
  };
  return { search, queries };
}

describe("SearchStockVideos", () => {
  it("orientasi mengikuti rasio klip; kueri dirapikan", async () => {
    const { search, queries } = fakeSearch();
    const use = new SearchStockVideos(search);
    expect(
      await use.execute({
        query: "  piggy   bank ",
        aspectRatio: "9:16",
        page: 2,
      }),
    ).toEqual({
      status: "ok",
      result: { videos: [], page: 2, hasMore: false },
    });
    await use.execute({ query: "x", aspectRatio: "1:1", page: 1 });
    await use.execute({ query: "x", aspectRatio: "16:9", page: 1 });
    expect(queries.map((q) => [q.query, q.orientation, q.perPage])).toEqual([
      ["piggy bank", "portrait", 12],
      ["x", "square", 12],
      ["x", "landscape", 12],
    ]);
  });

  it("hasil berorientasi sama dengan rasio klip diurutkan ke depan", async () => {
    const video = (id: number, width: number, height: number) => ({
      id,
      width,
      height,
      durationMs: 5_000,
      pageUrl: `https://pixabay.com/videos/v-${id}/`,
      thumbnailUrl: "https://cdn.pixabay.com/t.jpg",
      author: "Ana",
      url: "https://cdn.pixabay.com/v.mp4",
      previewUrl: "https://cdn.pixabay.com/v-small.mp4",
    });
    const use = new SearchStockVideos({
      search: async () => ({
        videos: [video(1, 1920, 1080), video(2, 1080, 1920)],
        page: 1,
        hasMore: false,
      }),
    });
    const result = await use.execute({
      query: "sea",
      aspectRatio: "9:16",
      page: 1,
    });
    expect(
      result.status === "ok" && result.result.videos.map((v) => v.id),
    ).toEqual([2, 1]);
  });

  it("kueri kosong / key belum ada / galat sumber stok", async () => {
    const { search, queries } = fakeSearch();
    expect(
      (
        await new SearchStockVideos(search).execute({
          query: "  ",
          aspectRatio: "9:16",
          page: 1,
        })
      ).status,
    ).toBe("invalid");
    expect(queries).toEqual([]);
    expect(
      await new SearchStockVideos(null).execute({
        query: "sea",
        aspectRatio: "9:16",
        page: 1,
      }),
    ).toMatchObject({ status: "unavailable", message: /PIXABAY_API_KEY/ });
    expect(
      await new SearchStockVideos(
        fakeSearch(new StockSearchError("kuota habis")).search,
      ).execute({ query: "sea", aspectRatio: "9:16", page: 1 }),
    ).toEqual({ status: "error", message: "kuota habis" });
    await expect(
      new SearchStockVideos(fakeSearch(new Error("bug")).search).execute({
        query: "sea",
        aspectRatio: "9:16",
        page: 1,
      }),
    ).rejects.toThrow("bug");
  });
});
