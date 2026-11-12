import { describe, expect, it } from "vitest";
import { StockSearchError } from "../application";
import { PIXABAY_VIDEOS_URL, PixabayVideoSearch } from "./pixabay-video-search";

const file = (width: number, height: number, name: string) => ({
  url: `https://cdn.pixabay.com/video/123/${name}.mp4`,
  width,
  height,
  size: 1_000_000,
  thumbnail: `https://cdn.pixabay.com/video/123/${name}.jpg`,
});

const hit = {
  id: 123,
  pageURL: "https://pixabay.com/videos/coins-123/",
  type: "film",
  tags: "coins, money",
  duration: 7,
  user_id: 9,
  user: "Ana",
  videos: {
    large: file(2160, 3840, "large"),
    medium: file(1080, 1920, "medium"),
    small: file(720, 1280, "small"),
    // Ukuran tidak tersedia.
    tiny: { url: "", width: 0, height: 0, size: 0, thumbnail: "" },
  },
};

function fakeFetch(response: Response | Error) {
  const urls: string[] = [];
  const fetchFn = async (url: string) => {
    urls.push(url);
    if (response instanceof Error) throw response;
    return response;
  };
  return { fetchFn, urls };
}

const query = {
  query: "piggy bank",
  orientation: "portrait" as const,
  page: 2,
  perPage: 12,
};

describe("PixabayVideoSearch", () => {
  it("memanggil API video dengan key & memetakan hasil", async () => {
    const { fetchFn, urls } = fakeFetch(
      Response.json({
        total: 500,
        totalHits: 30,
        hits: [hit, { id: "rusak" }],
      }),
    );
    const result = await new PixabayVideoSearch("kunci", fetchFn).search(query);
    expect(urls).toEqual([
      `${PIXABAY_VIDEOS_URL}?key=kunci&q=piggy+bank&video_type=film&safesearch=true&page=2&per_page=12`,
    ]);
    expect(result).toEqual({
      page: 2,
      // 2 × 12 = 24 < 30.
      hasMore: true,
      // Hit rusak dilewati, tidak menggagalkan pencarian.
      videos: [
        {
          id: 123,
          width: 1080,
          height: 1920,
          durationMs: 7_000,
          pageUrl: hit.pageURL,
          thumbnailUrl: "https://cdn.pixabay.com/video/123/medium.jpg",
          author: "Ana",
          url: "https://cdn.pixabay.com/video/123/medium.mp4",
          previewUrl: "https://cdn.pixabay.com/video/123/small.mp4",
        },
      ],
    });
  });

  it("halaman terakhir: page × per_page ≥ totalHits", async () => {
    const { fetchFn } = fakeFetch(Response.json({ totalHits: 24, hits: [] }));
    expect(await new PixabayVideoSearch("k", fetchFn).search(query)).toEqual({
      videos: [],
      page: 2,
      hasMore: false,
    });
  });

  it("video tanpa file yang tersedia dilewati; thumbnail dari ukuran lain", async () => {
    const noFiles = {
      ...hit,
      id: 1,
      videos: {
        tiny: { url: "", width: 0, height: 0, size: 0, thumbnail: "" },
      },
    };
    const smallOnly = {
      ...hit,
      id: 2,
      videos: {
        small: { ...file(720, 1280, "small"), thumbnail: "" },
        tiny: file(360, 640, "tiny"),
      },
    };
    const { fetchFn } = fakeFetch(
      Response.json({ totalHits: 2, hits: [noFiles, smallOnly] }),
    );
    const { videos } = await new PixabayVideoSearch("k", fetchFn).search(query);
    expect(
      videos.map((v) => [v.id, v.url, v.previewUrl, v.thumbnailUrl]),
    ).toEqual([
      [
        2,
        "https://cdn.pixabay.com/video/123/small.mp4",
        "https://cdn.pixabay.com/video/123/small.mp4",
        "https://cdn.pixabay.com/video/123/tiny.jpg",
      ],
    ]);
  });

  it.each([
    [
      new Response("[ERROR 400] Invalid key", { status: 400 }),
      /menolak permintaan/,
    ],
    [new Response(null, { status: 403 }), /menolak permintaan/],
    [new Response(null, { status: 429 }), /Batas pencarian Pixabay/],
    [new Response(null, { status: 500 }), /Pixabay gagal \(500\)/],
    [new Response("bukan json"), /tidak sesuai format/],
    [
      new TypeError("fetch failed https://pixabay.com/api/videos/?key=rahasia"),
      /Tidak bisa terhubung/,
    ],
  ])(
    "galat → StockSearchError berpesan tanpa key (%#)",
    async (response, message) => {
      const error: unknown = await new PixabayVideoSearch(
        "rahasia",
        fakeFetch(response).fetchFn,
      )
        .search(query)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StockSearchError);
      expect((error as Error).message).toMatch(message);
      expect((error as Error).message).not.toContain("rahasia");
    },
  );
});
