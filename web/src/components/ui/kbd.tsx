import * as React from "react";
import { cn } from "cn";

/** Chip tombol keyboard (radius 2, mono). Otomatis berbalik warna di dalam tooltip gelap. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border px-1 font-mono text-xs text-muted-foreground in-data-[slot=tooltip-content]:border-background/30 in-data-[slot=tooltip-content]:text-background/80",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
