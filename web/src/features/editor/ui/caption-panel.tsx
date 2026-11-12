"use client";

import { Check, RotateCcw } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import {
  CAPTION_PRESET_IDS,
  CAPTION_PRESETS,
  type CaptionFont,
  type CaptionPosition,
  type CaptionPresetId,
  type CaptionStyle,
  presetStyle,
} from "@/modules/captions/application";
import { ColorSwatches } from "./color-swatches";
import { PresetThumb } from "./caption-presets";
import { useEditor } from "./editor-store";

const FONTS: { id: CaptionFont; label: string }[] = [
  { id: "montserrat", label: "Montserrat" },
  { id: "poppins", label: "Poppins" },
  { id: "inter", label: "Inter" },
  { id: "anton", label: "Anton" },
  { id: "bebas-neue", label: "Bebas Neue" },
];

const POSITIONS: { id: CaptionPosition; label: string }[] = [
  { id: "top", label: "Atas" },
  { id: "middle", label: "Tengah" },
  { id: "bottom", label: "Bawah" },
];

const TEXT_PALETTE = ["#ffffff", "#e5e5e5", "#000000"];
const ACCENT_PALETTE = [
  "#facc15",
  "#4ade80",
  "#22c55e",
  "#38bdf8",
  "#8b5cf6",
  "#f472b6",
  "#ffffff",
];

type ColorKey = "textColor" | "highlightColor" | "keywordColor";
const COLORS: { key: ColorKey; label: string; palette: readonly string[] }[] = [
  { key: "textColor", label: "Teks", palette: TEXT_PALETTE },
  { key: "highlightColor", label: "Kata diucapkan", palette: ACCENT_PALETTE },
  { key: "keywordColor", label: "Kata kunci", palette: ACCENT_PALETTE },
];

/** Rentang slider ukuran (px pada kanvas 1080); skema menerima 32–200. */
const SIZE = { min: 40, max: 160, step: 2 };

const sameStyle = (a: CaptionStyle, b: CaptionStyle) =>
  (Object.keys(a) as (keyof CaptionStyle)[]).every((key) => a[key] === b[key]);

/**
 * Panel Captions: pilih preset (mengganti seluruh gaya dengan gaya bawaannya), lalu atur font,
 * warna, ukuran, posisi, dan huruf besar. Perubahan langsung tampil di pratinjau, ikut undo, dan
 * disimpan di EditingScript saat Simpan.
 */
export function CaptionPanel() {
  const caption = useEditor((s) => s.caption);
  const setCaption = useEditor((s) => s.setCaption);
  const style = caption ?? presetStyle();
  /** `control` hanya untuk kontrol kontinu (slider, pemilih warna): seretan = satu undo. */
  const update = (
    changes: Partial<Omit<CaptionStyle, "preset">>,
    control?: string,
  ) => setCaption({ ...style, ...changes }, control);
  const presetDefault = presetStyle(style.preset);

  return (
    <section aria-label="Pengaturan caption" className="space-y-4 text-sm">
      <h3 className="font-medium">Gaya animasi</h3>
      <RadioGroupPrimitive.Root
        aria-label="Gaya animasi"
        value={style.preset}
        onValueChange={(id) => setCaption(presetStyle(id as CaptionPresetId))}
        orientation="horizontal"
        className="grid grid-cols-2 gap-2"
      >
        {CAPTION_PRESET_IDS.map((id) => (
          <RadioGroupPrimitive.Item
            key={id}
            value={id}
            title={CAPTION_PRESETS[id].description}
            className="group border-border hover:bg-muted data-[state=checked]:border-foreground focus-visible:ring-ring/30 space-y-2 rounded-xl border p-2 text-left transition-colors outline-none focus-visible:ring-3 data-[state=checked]:border-[1.5px]"
          >
            <PresetThumb id={id} />
            <span className="flex items-center justify-between gap-1 px-0.5">
              {CAPTION_PRESETS[id].label}
              <Check
                className="size-4 shrink-0 opacity-0 group-data-[state=checked]:opacity-100"
                aria-hidden
              />
            </span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>

      <div className="border-border space-y-4 rounded-xl border p-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-muted-foreground block">Font</span>
            <Select
              value={style.font}
              onChange={(event) =>
                update({ font: event.currentTarget.value as CaptionFont })
              }
            >
              {FONTS.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label}
                </option>
              ))}
            </Select>
          </label>
          <div className="space-y-1.5">
            <p className="text-muted-foreground flex justify-between">
              Ukuran
              <span
                className="label-mono text-foreground tabular-nums"
                data-testid="caption-size"
              >
                {style.size}
              </span>
            </p>
            <Slider
              aria-label="Ukuran caption"
              min={SIZE.min}
              max={SIZE.max}
              step={SIZE.step}
              value={[style.size]}
              onValueChange={([size]) =>
                update({ size: size ?? style.size }, "size")
              }
              className="h-8"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-muted-foreground" id="caption-position">
            Posisi
          </p>
          <SegmentedControl
            aria-labelledby="caption-position"
            value={style.position}
            onValueChange={(id) => update({ position: id as CaptionPosition })}
          >
            {POSITIONS.map(({ id, label }) => (
              <SegmentedControlItem key={id} value={id}>
                {label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-muted-foreground mb-2">Warna</legend>
          {COLORS.map(({ key, label, palette }) => (
            <div key={key} className="space-y-1.5">
              <span className="block">{label}</span>
              <ColorSwatches
                label={label}
                value={style[key]}
                palette={palette}
                onChange={(color, continuous) =>
                  update({ [key]: color }, continuous ? key : undefined)
                }
              />
            </div>
          ))}
        </fieldset>

        <label className="flex items-center gap-2">
          <Checkbox
            checked={style.uppercase}
            onCheckedChange={(checked) =>
              update({ uppercase: checked === true })
            }
          />
          Huruf besar
        </label>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setCaption(presetDefault)}
        disabled={sameStyle(style, presetDefault)}
      >
        <RotateCcw aria-hidden />
        Kembalikan gaya preset
      </Button>
    </section>
  );
}
