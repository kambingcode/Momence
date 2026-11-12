"use client";

import * as React from "react";
import { cn } from "cn";
import { Slider as SliderPrimitive } from "radix-ui";

/**
 * Trek hairline, isian charcoal, jempol putih berbingkai charcoal. Satu jempol per nilai;
 * `aria-label` dipasang di jempol (elemen `role="slider"`), bukan di akar.
 */
function Slider({
  className,
  value,
  defaultValue,
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = (value ?? defaultValue ?? [0]).length;
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      defaultValue={defaultValue}
      className={cn(
        "relative flex h-5 w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1 grow overflow-hidden rounded-full bg-border"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-primary"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          data-slot="slider-thumb"
          aria-label={ariaLabel}
          className="block size-4 rounded-full border border-primary bg-background shadow-sm transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
