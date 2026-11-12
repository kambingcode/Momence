import * as React from "react";
import { cn } from "cn";
import { ChevronDown } from "lucide-react";

/** `<select>` native bergaya Input Shade (tepi radius 9, panah sendiri); keyboard & a11y bawaan browser. */
function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        data-slot="select"
        className={cn(
          "h-8 w-full appearance-none rounded-lg border border-input bg-background pr-8 pl-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </span>
  );
}

export { Select };
