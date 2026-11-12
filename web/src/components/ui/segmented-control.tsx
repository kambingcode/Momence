"use client";

import * as React from "react";
import { cn } from "cn";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

/**
 * Pilihan satu-dari-beberapa yang berdampingan (Atas/Tengah/Bawah, Isi/Utuh). Bukan tab:
 * wadah radius 9 berhairline, pilihan aktif = isi bone + garis charcoal (tanpa pil, tanpa violet).
 * Memakai semantik `radiogroup` sehingga panah ←→ berpindah pilihan dan tidak bisa dikosongkan.
 */
function SegmentedControl({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented-control"
      orientation="horizontal"
      className={cn(
        "grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg border border-border p-0.5",
        className,
      )}
      {...props}
    />
  );
}

function SegmentedControlItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="segmented-control-item"
      className={cn(
        "rounded-sm border border-transparent px-3 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:border-foreground data-[state=checked]:bg-secondary data-[state=checked]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </RadioGroupPrimitive.Item>
  );
}

export { SegmentedControl, SegmentedControlItem };
