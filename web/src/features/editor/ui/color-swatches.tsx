"use client";

import { cn } from "cn";
import { Check, Plus } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

const RING = "focus-visible:ring-3 focus-visible:ring-ring/30 outline-none";

/**
 * Pemilih warna caption: swatch bulat dari palet + satu swatch "kustom" (pemilih warna bawaan
 * browser). Terpilih = cincin charcoal. Swatch adalah data pengguna, jadi boleh jenuh.
 */
export function ColorSwatches({
  label,
  value,
  palette,
  onChange,
}: {
  label: string;
  value: string;
  palette: readonly string[];
  /** `continuous` = berasal dari seretan pemilih warna (digabung jadi satu undo). */
  onChange: (color: string, continuous: boolean) => void;
}) {
  const current = value.toLowerCase();
  const custom = !palette.includes(current);
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      value={custom ? "" : current}
      onValueChange={(next) => onChange(next, false)}
      orientation="horizontal"
      className="flex flex-wrap items-center gap-2"
    >
      {palette.map((color) => (
        <RadioGroupPrimitive.Item
          key={color}
          value={color}
          aria-label={color}
          className={cn(
            "flex size-6 items-center justify-center rounded-full border border-border ring-offset-2 ring-offset-background transition-shadow data-[state=checked]:ring-2 data-[state=checked]:ring-foreground",
            RING,
          )}
          style={{ background: color }}
        >
          <RadioGroupPrimitive.Indicator>
            <Check
              className="size-3"
              strokeWidth={3}
              style={{ color: readableOn(color) }}
              aria-hidden
            />
          </RadioGroupPrimitive.Indicator>
        </RadioGroupPrimitive.Item>
      ))}
      <label
        title="Warna lain"
        className={cn(
          "relative flex size-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-foreground ring-offset-2 ring-offset-background focus-within:ring-3 focus-within:ring-ring/30",
          custom && "ring-2 ring-foreground",
        )}
        style={custom ? { background: value } : undefined}
      >
        {!custom && <Plus className="size-3" aria-hidden />}
        <input
          type="color"
          value={value}
          aria-label={`${label}: warna lain`}
          onChange={(event) => onChange(event.currentTarget.value, true)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </RadioGroupPrimitive.Root>
  );
}

/** Hitam atau putih, mana yang terbaca di atas `hex`. */
function readableOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#131315" : "#ffffff";
}
