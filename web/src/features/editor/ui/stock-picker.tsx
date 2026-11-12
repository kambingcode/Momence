"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Loader2, Search, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchStockVideos, stockSearchQueryKey } from "@/features/broll/api";
import { formatDuration } from "@/features/projects/ui/format";
import type { AspectRatio, StockVideo } from "@/shared/schemas";

interface StockPickerProps {
  /** Kata kunci usulan (bahasa Inggris), yang pertama langsung dicari. */
  keywords: readonly string[];
  ratio: AspectRatio;
  /** Panjang rentang B-roll; video lebih pendek akan diputar ulang. */
  rangeMs: number;
  onPick: (video: StockVideo) => void;
  onClose: () => void;
}

/** Bentuk tile hasil = bentuk B-roll di klip (video di-crop memenuhi frame). */
const TILE_ASPECT: Record<AspectRatio, string> = {
  "9:16": "aspect-[3/4]",
  "1:1": "aspect-square",
  "16:9": "aspect-video",
};

/** Hasil pencarian jarang berubah; server juga meng-cache 24 jam (ketentuan Pixabay). */
const SEARCH_STALE_MS = 60 * 60 * 1000;

/** Cari & pilih video stok Pixabay untuk satu rentang B-roll. */
export function StockPicker({
  keywords,
  ratio,
  rangeMs,
  onPick,
  onClose,
}: StockPickerProps) {
  const [input, setInput] = useState(keywords[0] ?? "");
  const [query, setQuery] = useState(keywords[0] ?? "");
  const results = useInfiniteQuery({
    queryKey: stockSearchQueryKey(query, ratio),
    queryFn: ({ pageParam }) => searchStockVideos(query, ratio, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: query !== "",
    staleTime: SEARCH_STALE_MS,
    retry: false,
  });
  const search = (text: string) => {
    setInput(text);
    setQuery(text.trim());
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    search(input);
  };
  const videos = results.data?.pages.flatMap((page) => page.videos) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <form onSubmit={submit} className="flex flex-1 gap-2">
          <Input
            type="search"
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="Cari video stok (bahasa Inggris)"
            aria-label="Kata kunci video stok"
            lang="en"
            className="flex-1 [&::-webkit-search-cancel-button]:appearance-none"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search aria-hidden />
            Cari
          </Button>
        </form>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Tutup pencarian"
        >
          <X aria-hidden />
        </Button>
      </div>
      {keywords.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {keywords.map((keyword) => (
            <button
              key={keyword}
              type="button"
              lang="en"
              onClick={() => search(keyword)}
              aria-pressed={keyword === query}
              className="border-border hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-secondary rounded-xs border px-1.5 py-0.5 text-xs"
            >
              {keyword}
            </button>
          ))}
        </div>
      )}

      {results.isError && (
        <p role="alert" className="text-destructive text-xs">
          {results.error.message}
        </p>
      )}
      {results.isPending && query !== "" && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Mencari di Pixabay…
        </p>
      )}
      {results.isSuccess && videos.length === 0 && (
        <p className="text-muted-foreground text-xs">
          Tidak ada video untuk “{query}”. Coba kata kunci lain.
        </p>
      )}
      {videos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {videos.map((video) => (
            <li key={video.id}>
              <VideoChoice
                video={video}
                short={video.durationMs < rangeMs}
                aspect={TILE_ASPECT[ratio]}
                onPick={() => onPick(video)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2">
        <a
          href="https://pixabay.com"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground text-xs underline-offset-2 hover:underline"
        >
          Video disediakan oleh Pixabay
        </a>
        {results.hasNextPage && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void results.fetchNextPage()}
            disabled={results.isFetchingNextPage}
          >
            {results.isFetchingNextPage && (
              <Loader2 className="animate-spin" aria-hidden />
            )}
            Muat lagi
          </Button>
        )}
      </div>
    </div>
  );
}

function VideoChoice({
  video,
  short,
  aspect,
  onPick,
}: {
  video: StockVideo;
  short: boolean;
  aspect: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Pakai video oleh ${video.author}, durasi ${formatDuration(video.durationMs)}`}
      title={`Pakai video oleh ${video.author}`}
      className={cn(
        "group border-border hover:border-foreground focus-visible:border-foreground focus-visible:ring-ring/30 relative block w-full overflow-hidden rounded-xs border bg-black outline-none hover:border-2 focus-visible:ring-3",
        aspect,
      )}
    >
      {/* Pratinjau diputar saat kursor di atasnya; poster = thumbnail dari Pixabay. */}
      <video
        src={video.previewUrl}
        poster={video.thumbnailUrl}
        muted
        loop
        playsInline
        preload="none"
        onMouseEnter={(event) =>
          void event.currentTarget.play().catch(() => {})
        }
        onMouseLeave={(event) => event.currentTarget.pause()}
        className="size-full object-cover"
      />
      <span className="absolute right-1 bottom-1 rounded-xs bg-black/70 px-1 font-mono text-[10px] text-white tabular-nums">
        {formatDuration(video.durationMs)}
        {short && " · diulang"}
      </span>
      <span className="absolute inset-x-0 top-0 truncate bg-black/60 px-1 py-0.5 text-left text-[10px] text-white opacity-0 transition-opacity group-focus-visible:opacity-100 group-hover:opacity-100">
        {video.author}
      </span>
    </button>
  );
}
