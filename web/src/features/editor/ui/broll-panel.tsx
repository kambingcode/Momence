"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import {
  Clapperboard,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  brollPlanQueryKey,
  fetchBrollPlan,
  startBrollPlan,
} from "@/features/broll/api";
import { jobsPollInterval } from "@/features/jobs/poll";
import { formatDuration } from "@/features/projects/ui/format";
import {
  type BrollRow,
  brollRows,
  type ClipBrollPlan,
  manualRange,
  visibleMs,
} from "@/modules/broll/application";
import { sourceToClipMs, type Timeline } from "@/modules/editor/application";
import type {
  AspectRatio,
  BrollItem,
  BrollSlot,
  StockVideo,
} from "@/shared/schemas";
import { useEditor } from "./editor-store";
import { StockPicker } from "./stock-picker";

interface BrollPanelProps {
  clipId: string;
  /** Akhir klip (ms video sumber): batas B-roll manual. */
  clipEndMs: number;
  timeline: Timeline;
  /** Posisi pratinjau sekarang (ms video sumber). */
  currentSourceMs: () => number;
  /** Lompat pratinjau ke waktu sumber ini. */
  onSeek: (sourceMs: number) => void;
}

/** Panjang B-roll yang ditambahkan manual di posisi pratinjau. */
const MANUAL_BROLL_MS = 3_000;

type Row = BrollRow<BrollSlot, BrollItem>;

/** Rentang yang sedang dicarikan video stoknya. */
interface Picking {
  startMs: number;
  endMs: number;
  keywords: readonly string[];
}

const toItem = (
  range: { startMs: number; endMs: number },
  video: StockVideo,
): BrollItem => ({
  startMs: range.startMs,
  endMs: range.endMs,
  stockVideoId: video.id,
  url: video.url,
  previewUrl: video.previewUrl,
  thumbnailUrl: video.thumbnailUrl,
  pageUrl: video.pageUrl,
  durationMs: video.durationMs,
  attribution: `Video oleh ${video.author} di Pixabay`,
});

/**
 * Panel B-roll: minta Gemini mencari tempat B-roll di klip (dari editan yang sedang dibuka),
 * lalu pasang video stok Pixabay di tiap tempat — atau di posisi pratinjau. Pemasangan ikut undo
 * dan disimpan di EditingScript saat Simpan.
 */
export function BrollPanel({
  clipId,
  clipEndMs,
  timeline,
  currentSourceMs,
  onSeek,
}: BrollPanelProps) {
  const removed = useEditor((s) => s.removed);
  const corrections = useEditor((s) => s.corrections);
  const broll = useEditor((s) => s.broll);
  const ratio = useEditor((s) => s.reframe.aspectRatio);
  const placeBroll = useEditor((s) => s.placeBroll);
  const removeBroll = useEditor((s) => s.removeBroll);
  const [picking, setPicking] = useState<Picking | null>(null);
  const queryClient = useQueryClient();
  const plan = useQuery({
    queryKey: brollPlanQueryKey(clipId),
    queryFn: () => fetchBrollPlan(clipId),
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      return query.state.data?.status === "pending" && job
        ? jobsPollInterval([job])
        : false;
    },
  });
  const start = useMutation({
    mutationFn: () =>
      startBrollPlan(clipId, {
        removedTokenIds: removed.flatMap((r) => r.tokenIds),
        corrections: { ...corrections },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: brollPlanQueryKey(clipId) }),
  });
  const state = plan.data;
  const pending = state?.status === "pending";
  const rows = brollRows(state?.slots ?? [], broll);
  const manualAt = manualRange(currentSourceMs(), clipEndMs, MANUAL_BROLL_MS);
  const manual = () => {
    if (manualAt) setPicking({ ...manualAt, keywords: [] });
  };
  const pick = (video: StockVideo) => {
    if (!picking) return;
    placeBroll(toItem(picking, video));
    setPicking(null);
  };
  // Rentang manual yang belum dipasang tidak punya baris; pemilihnya ditampilkan di atas daftar.
  const pickingNewRange =
    picking !== null &&
    !rows.some((row) => row.range.startMs === picking.startMs);
  const ready = state?.status === "ready";

  return (
    <section aria-label="B-roll" className="space-y-4 text-sm">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">
          Video stok ditumpuk di atas klip pada rentang waktunya. Gemini mencari
          kalimat yang cocok ditutup video 2–5 detik; bagian yang sudah dihapus
          tidak ikut dicari.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={ready ? "outline" : "default"}
          onClick={() => start.mutate()}
          disabled={plan.isPending || pending || start.isPending}
        >
          {pending || start.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : ready ? (
            <RotateCcw aria-hidden />
          ) : (
            <Clapperboard aria-hidden />
          )}
          {ready ? "Cari ulang" : "Cari tempat B-roll"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={manual}
          disabled={manualAt === null}
        >
          <Plus aria-hidden />
          {manualAt
            ? `B-roll manual di ${formatDuration(sourceToClipMs(timeline, manualAt.startMs))}`
            : "B-roll manual"}
        </Button>
      </div>
      <div aria-live="polite" className="space-y-3">
        {plan.isError && (
          <p role="alert" className="text-destructive text-xs">
            Gagal memuat rencana B-roll: {plan.error.message}
          </p>
        )}
        {start.error && (
          <p role="alert" className="text-destructive text-xs">
            {start.error.message}
          </p>
        )}
        {state && <PlanStatus state={state} />}
      </div>
      {pickingNewRange && (
        <div className="border-foreground space-y-3 rounded-xl border-[1.5px] p-3">
          <p className="flex items-center gap-2">
            <RangeChip
              timeline={timeline}
              range={{ startMs: picking.startMs, endMs: picking.endMs }}
            />
            B-roll baru
          </p>
          <StockPicker
            keywords={picking.keywords}
            ratio={ratio}
            rangeMs={picking.endMs - picking.startMs}
            onPick={pick}
            onClose={() => setPicking(null)}
          />
        </div>
      )}
      {rows.length > 0 && (
        <ol className="space-y-2">
          {rows.map((row) => (
            <RowItem
              key={row.range.startMs}
              row={row}
              timeline={timeline}
              ratio={ratio}
              picking={picking?.startMs === row.range.startMs}
              onSeek={onSeek}
              onPick={() =>
                setPicking({
                  startMs: row.range.startMs,
                  endMs: row.range.endMs,
                  keywords: row.slot?.keywords ?? [],
                })
              }
              onPicked={pick}
              onClosePicker={() => setPicking(null)}
              onRemove={() => removeBroll(row.range.startMs)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Rentang waktu klip (setelah potongan) sebagai chip mono, mis. "0:03–0:07". */
export function RangeChip({
  timeline,
  range,
}: {
  timeline: Timeline;
  range: { startMs: number; endMs: number };
}) {
  return (
    <span className="label-mono bg-secondary shrink-0 rounded-xs px-1.5 py-0.5 text-xs tabular-nums">
      {formatDuration(sourceToClipMs(timeline, range.startMs))}–
      {formatDuration(sourceToClipMs(timeline, range.endMs))}
    </span>
  );
}

function PlanStatus({ state }: { state: ClipBrollPlan }) {
  switch (state.status) {
    case "missing":
      return null;
    case "pending":
      return (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {state.job?.status === "running"
            ? "Gemini sedang mencari tempat B-roll…"
            : "Menunggu worker…"}
        </p>
      );
    case "failed":
      return (
        <p role="alert" className="text-destructive text-xs break-words">
          Pencarian tempat B-roll gagal:{" "}
          {state.job?.error ?? "hasil tidak terbaca"}
        </p>
      );
    case "ready":
      return state.slots.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Gemini tidak menemukan tempat yang cocok untuk B-roll di klip ini.
        </p>
      ) : null;
  }
}

function RowItem({
  row,
  timeline,
  ratio,
  picking,
  onSeek,
  onPick,
  onPicked,
  onClosePicker,
  onRemove,
}: {
  row: Row;
  timeline: Timeline;
  ratio: AspectRatio;
  picking: boolean;
  onSeek: (sourceMs: number) => void;
  onPick: () => void;
  onPicked: (video: StockVideo) => void;
  onClosePicker: () => void;
  onRemove: () => void;
}) {
  const { slot, item, range } = row;
  // Rentang yang kemudian dihapus dari klip tidak akan tampil di pratinjau maupun MP4.
  const hidden = visibleMs(timeline.segments, range) === 0;
  const title = slot?.intent ?? "B-roll manual";
  return (
    <li
      className={cn(
        "border-border space-y-3 rounded-xl border p-3",
        picking && "border-foreground border-[1.5px]",
        hidden && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSeek(range.startMs)}
          disabled={hidden}
          title={title}
          className="focus-visible:ring-ring/30 flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-3"
        >
          <RangeChip timeline={timeline} range={range} />
          <span className="truncate">{title}</span>
        </button>
        {item && (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onRemove}
            aria-label="Hapus B-roll"
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
      {slot && (
        <p className="text-muted-foreground text-xs italic">“{slot.text}”</p>
      )}
      {hidden && (
        <p className="text-muted-foreground text-xs">
          Bagian ini sudah dihapus dari klip.
        </p>
      )}
      {slot && slot.keywords.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {slot.keywords.map((keyword) => (
            <li
              key={keyword}
              lang="en"
              className="border-border rounded-xs border px-1.5 py-0.5 text-xs"
            >
              {keyword}
            </li>
          ))}
        </ul>
      )}
      {item && (
        <div className="bg-secondary flex items-center gap-3 rounded-lg p-2">
          <a
            href={item.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="block aspect-[3/4] w-12 shrink-0 overflow-hidden rounded-xs bg-black"
            title="Buka di Pixabay"
          >
            <video
              src={item.previewUrl}
              poster={item.thumbnailUrl}
              muted
              preload="none"
              className="size-full object-cover"
            />
          </a>
          <p className="text-muted-foreground min-w-0 flex-1 text-xs">
            {item.attribution}
          </p>
          {!picking && (
            <Button type="button" size="sm" variant="outline" onClick={onPick}>
              <RefreshCw aria-hidden />
              Ganti
            </Button>
          )}
        </div>
      )}
      {!item && !picking && (
        <Button type="button" size="sm" variant="outline" onClick={onPick}>
          <Plus aria-hidden />
          Pilih video
        </Button>
      )}
      {picking && (
        <StockPicker
          keywords={slot?.keywords ?? []}
          ratio={ratio}
          rangeMs={range.endMs - range.startMs}
          onPick={onPicked}
          onClose={onClosePicker}
        />
      )}
    </li>
  );
}
