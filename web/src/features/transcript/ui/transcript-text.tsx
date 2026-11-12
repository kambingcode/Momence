"use client";

import { cn } from "cn";
import { memo, useEffect, useMemo, useRef } from "react";
import { paragraphRanges } from "@/modules/transcript/application";
import type { TranscriptToken } from "@/shared/schemas/transcript";
import { formatPause, formatTimestamp } from "./format";

interface TranscriptTextProps {
  tokens: readonly TranscriptToken[];
  activeIndex: number;
  /** Diminta lompat ke waktu (ms) ini. */
  onSeek: (timeMs: number) => void;
  /** Gulir mengikuti kata aktif (hanya bila wadahnya sendiri bisa digulir). */
  follow: boolean;
}

/**
 * Transkrip read-only per kata. Klik kata/jeda → lompat ke waktunya; tombol penanda waktu tiap
 * paragraf untuk keyboard. Satu handler klik di wadah (bukan per kata) & token di-memo, sehingga
 * transkrip ribuan kata tetap ringan saat sorotan berpindah.
 */
export function TranscriptText({
  tokens,
  activeIndex,
  onSeek,
  follow,
}: TranscriptTextProps) {
  const container = useRef<HTMLDivElement>(null);
  const paragraphs = useMemo(
    () =>
      paragraphRanges(tokens).map(({ start, end }) => {
        const first = tokens.slice(start, end).find((t) => t.type !== "pause");
        return { start, end, startMs: (first ?? tokens[start]).startMs };
      }),
    [tokens],
  );

  useEffect(() => {
    const box = container.current;
    if (!follow || activeIndex < 0 || !box) return;
    if (box.scrollHeight <= box.clientHeight) return;
    const element = box.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    if (!element) return;
    const boxRect = box.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (rect.top < boxRect.top + 24 || rect.bottom > boxRect.bottom - 24) {
      box.scrollTo({
        top: box.scrollTop + rect.top - boxRect.top - box.clientHeight / 3,
        behavior: "smooth",
      });
    }
  }, [activeIndex, follow]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-index]",
    );
    if (!target) return;
    const token = tokens[Number(target.dataset.index)];
    if (token) onSeek(token.startMs);
  };

  return (
    <div
      ref={container}
      onClick={handleClick}
      className="space-y-5 overflow-y-auto pr-2 leading-8 lg:max-h-[calc(100dvh-15rem)]"
    >
      {paragraphs.map(({ start, end, startMs }) => (
        <Paragraph
          key={start}
          tokens={tokens}
          start={start}
          end={end}
          startMs={startMs}
          // Paragraf tanpa kata aktif menerima -1 tetap → tidak dirender ulang.
          activeIndex={
            activeIndex >= start && activeIndex < end ? activeIndex : -1
          }
          onSeek={onSeek}
        />
      ))}
    </div>
  );
}

const Paragraph = memo(function Paragraph({
  tokens,
  start,
  end,
  startMs,
  activeIndex,
  onSeek,
}: {
  tokens: readonly TranscriptToken[];
  start: number;
  end: number;
  startMs: number;
  activeIndex: number;
  onSeek: (timeMs: number) => void;
}) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSeek(startMs);
        }}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 h-fit shrink-0 rounded pt-1.5 font-mono text-xs tabular-nums outline-none focus-visible:ring-2"
        aria-label={`Putar dari ${formatTimestamp(startMs)}`}
      >
        {formatTimestamp(startMs)}
      </button>
      <p className="min-w-0">
        {tokens.slice(start, end).map((token, offset) => (
          <Token
            key={token.id}
            token={token}
            index={start + offset}
            active={start + offset === activeIndex}
          />
        ))}
      </p>
    </div>
  );
});

const Token = memo(function Token({
  token,
  index,
  active,
}: {
  token: TranscriptToken;
  index: number;
  active: boolean;
}) {
  const time = formatTimestamp(token.startMs);
  if (token.type === "pause") {
    return (
      <>
        <span
          data-index={index}
          data-token-id={token.id}
          title={`Jeda ${formatPause(token.endMs - token.startMs)} · ${time}`}
          className={cn(
            "bg-muted text-muted-foreground mx-0.5 inline-block cursor-pointer rounded px-1.5 align-middle text-xs leading-5",
            active && "bg-primary/15 text-foreground",
          )}
        >
          {formatPause(token.endMs - token.startMs)}
        </span>{" "}
      </>
    );
  }
  return (
    <>
      <span
        data-index={index}
        data-token-id={token.id}
        aria-current={active || undefined}
        title={token.type === "filler" ? `Kata pengisi · ${time}` : time}
        className={cn(
          "hover:bg-muted -mx-0.5 cursor-pointer rounded px-0.5 transition-colors",
          token.type === "filler" &&
            "text-muted-foreground decoration-muted-foreground/60 italic underline decoration-dotted underline-offset-4",
          active && "bg-primary/15 text-foreground hover:bg-primary/20",
        )}
      >
        {token.text}
      </span>{" "}
    </>
  );
});
