"use client";

import { ArrowDown, ArrowUp, Trash2, Type } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  defaultTextRange,
  type TimeRange,
  type Timeline,
} from "@/modules/editor/application";
import { TEXT_FONT_LABELS, textFont } from "@/remotion/text/fonts";
import {
  MAX_TEXT_OVERLAYS,
  TEXT_OVERLAY_MAX_LENGTH,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  type TextFont,
  type TextOverlay,
  textFontSchema,
} from "@/shared/schemas";
import { RangeChip } from "./broll-panel";
import { ColorSwatches } from "./color-swatches";
import { useEditor } from "./editor-store";

const TEXT_COLORS = [
  "#ffffff",
  "#000000",
  "#facc15",
  "#4ade80",
  "#38bdf8",
  "#f472b6",
  "#ef4444",
];

interface TextPanelProps {
  /** Rentang klip di video sumber (batas teks baru). */
  clip: TimeRange;
  timeline: Timeline;
  /** Id teks yang tampil di klip (tidak seluruhnya di bagian terpotong). */
  shownIds: ReadonlySet<string>;
  /** Posisi pratinjau sekarang (ms video sumber). */
  currentSourceMs: () => number;
  /** Lompat pratinjau ke waktu sumber ini. */
  onSeek: (sourceMs: number) => void;
}

/**
 * Panel Teks: tambah teks custom (maks. `MAX_TEXT_OVERLAYS`), daftar layer (paling depan di atas),
 * lalu isi, font, ukuran & warna teks terpilih. Posisi diseret di pratinjau, waktu di Peta klip.
 */
export function TextPanel({
  clip,
  timeline,
  shownIds,
  currentSourceMs,
  onSeek,
}: TextPanelProps) {
  const textOverlays = useEditor((s) => s.textOverlays);
  const selectedId = useEditor((s) => s.selectedTextId);
  const selectText = useEditor((s) => s.selectText);
  const addText = useEditor((s) => s.addText);
  const full = textOverlays.length >= MAX_TEXT_OVERLAYS;
  const selected = textOverlays.find((t) => t.id === selectedId) ?? null;
  // Daftar ditampilkan dari depan ke belakang (data: yang terakhir paling depan).
  const layers = textOverlays.map((item, index) => ({ item, index })).reverse();

  return (
    <section aria-label="Pengaturan teks" className="space-y-4 text-sm">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">Daftar teks</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={full}
            aria-describedby={full ? "text-limit" : undefined}
            onClick={() => addText(defaultTextRange(currentSourceMs(), clip))}
          >
            <Type aria-hidden />
            Tambah teks
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Ikut ter-export ke MP4. Seret teks di pratinjau untuk memindah; atur
          waktunya di Peta klip.
        </p>
        {full && (
          <p id="text-limit" className="text-muted-foreground text-xs">
            Maksimal {MAX_TEXT_OVERLAYS} teks per klip.
          </p>
        )}
      </div>

      {textOverlays.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed p-4 text-center text-xs">
          Belum ada teks. Tambahkan judul, ajakan, atau label — teks muncul di
          posisi pratinjau selama 3 detik.
        </div>
      ) : (
        <ul aria-label="Lapisan teks" className="space-y-2">
          {layers.map(({ item, index }) => (
            <LayerCard
              key={item.id}
              item={item}
              timeline={timeline}
              selected={item.id === selected?.id}
              shown={shownIds.has(item.id)}
              isFront={index === textOverlays.length - 1}
              isBack={index === 0}
              onSelect={() => {
                selectText(item.id);
                onSeek(item.startMs);
              }}
            />
          ))}
        </ul>
      )}

      {selected && <TextSettings key={selected.id} item={selected} />}
    </section>
  );
}

function LayerCard({
  item,
  timeline,
  selected,
  shown,
  isFront,
  isBack,
  onSelect,
}: {
  item: TextOverlay;
  timeline: Timeline;
  selected: boolean;
  shown: boolean;
  isFront: boolean;
  isBack: boolean;
  onSelect: () => void;
}) {
  const removeText = useEditor((s) => s.removeText);
  const reorderText = useEditor((s) => s.reorderText);
  const label = item.text.trim() || "(kosong)";
  return (
    <li
      className={cn(
        "border-border flex items-center gap-1 rounded-xl border p-2",
        selected && "border-foreground border-[1.5px]",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title={item.text}
        className="focus-visible:ring-ring/30 flex min-w-0 flex-1 flex-col items-start gap-1 rounded-sm text-left outline-none focus-visible:ring-3"
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <RangeChip timeline={timeline} range={item} />
          <span className="truncate">{label}</span>
        </span>
        {!shown && (
          <span className="text-muted-foreground text-xs">
            Seluruhnya terpotong — tidak tampil
          </span>
        )}
      </button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        disabled={isFront}
        onClick={() => reorderText(item.id, "forward")}
        aria-label={`Ke depan: ${label}`}
        title="Ke depan"
      >
        <ArrowUp aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        disabled={isBack}
        onClick={() => reorderText(item.id, "backward")}
        aria-label={`Ke belakang: ${label}`}
        title="Ke belakang"
      >
        <ArrowDown aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        onClick={() => removeText(item.id)}
        aria-label={`Hapus teks: ${label}`}
        title="Hapus"
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  );
}

/** Isi, font, ukuran & warna teks terpilih; perubahan langsung tampil di pratinjau. */
function TextSettings({ item }: { item: TextOverlay }) {
  const updateText = useEditor((s) => s.updateText);
  // Font terpilih dimuat di browser untuk contoh di bawah pilihan font.
  const face = textFont(item.font);
  return (
    <div className="border-border space-y-4 rounded-xl border p-4">
      <label className="block space-y-1.5">
        <span className="text-muted-foreground block">Isi teks</span>
        <textarea
          value={item.text}
          maxLength={TEXT_OVERLAY_MAX_LENGTH}
          rows={3}
          onChange={(event) =>
            updateText(item.id, { text: event.currentTarget.value }, "text")
          }
          className="border-input bg-background focus-visible:ring-ring/30 w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3"
        />
      </label>
      <div className="space-y-1.5">
        <label className="block space-y-1.5">
          <span className="text-muted-foreground block">Font</span>
          <Select
            value={item.font}
            onChange={(event) =>
              updateText(item.id, {
                font: event.currentTarget.value as TextFont,
              })
            }
          >
            {textFontSchema.options.map((font) => (
              <option key={font} value={font}>
                {TEXT_FONT_LABELS[font]}
              </option>
            ))}
          </Select>
        </label>
        <span
          aria-hidden
          data-testid="text-font-sample"
          className="bg-secondary block truncate rounded-lg px-3 py-2 text-lg"
          style={{ fontFamily: face.family, fontWeight: face.weight }}
        >
          {item.text.trim() || TEXT_FONT_LABELS[item.font]}
        </span>
      </div>
      <div className="space-y-1.5">
        <p className="text-muted-foreground flex justify-between">
          Ukuran
          <span className="label-mono text-foreground tabular-nums">
            {item.fontSize}%
          </span>
        </p>
        <Slider
          aria-label="Ukuran teks"
          min={TEXT_SIZE_MIN}
          max={TEXT_SIZE_MAX}
          step={0.5}
          value={[item.fontSize]}
          onValueChange={([fontSize]) =>
            updateText(item.id, { fontSize: fontSize ?? item.fontSize }, "size")
          }
          className="h-8"
        />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-muted-foreground mb-1.5">Warna</legend>
        <ColorSwatches
          label="Warna teks"
          value={item.color}
          palette={TEXT_COLORS}
          onChange={(color, continuous) =>
            updateText(item.id, { color }, continuous ? "color" : undefined)
          }
        />
      </fieldset>
    </div>
  );
}
