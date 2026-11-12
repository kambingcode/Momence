"use client";

import * as React from "react";
import { cn } from "cn";
import { Tabs as TabsPrimitive } from "radix-ui";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
}

/** Deret tab dengan hairline di bawah; tab aktif bergaris bawah violet 2px (DESIGN.md) dan berbobot 500, tanpa latar pil. */
function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex w-full items-stretch border-b border-border",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative -mb-px flex-1 px-3 py-2.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 data-[state=active]:font-medium data-[state=active]:text-foreground",
        "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-transparent data-[state=active]:after:bg-logo-violet",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Isi tab. Dengan `forceMount` panel nonaktif tetap terpasang (state slider/input tidak hilang)
 * dan hanya disembunyikan lewat `data-[state=inactive]:hidden`.
 */
function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none data-[state=inactive]:hidden", className)}
      {...props}
    />
  );
}

/**
 * Rail tab vertikal (panel alat di tepi kanan editor): ikon di atas label kecil. Di `lg+` tegak
 * dengan hairline kiri; di bawahnya mendatar dengan hairline bawah. Tab aktif = isi bone + bobot
 * 500 + garis violet 2px di sisi rail (setara garis bawah tab aktif, DESIGN.md).
 */
function RailTabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="rail-tabs-list"
      className={cn(
        "flex shrink-0 gap-1 overflow-x-auto border-b border-border p-1.5 lg:w-18 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:border-b-0 lg:border-l lg:py-3",
        className,
      )}
      {...props}
    />
  );
}

function RailTabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="rail-tabs-trigger"
      className={cn(
        "relative flex min-w-16 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs text-muted-foreground transition-colors duration-150 outline-none hover:bg-secondary/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 lg:flex-none [&_svg]:size-5 [&_svg]:shrink-0",
        "data-[state=active]:bg-secondary data-[state=active]:font-medium data-[state=active]:text-foreground",
        "after:absolute after:bg-transparent data-[state=active]:after:bg-logo-violet max-lg:after:inset-x-3 max-lg:after:-bottom-1.5 max-lg:after:h-0.5 lg:after:inset-y-2 lg:after:-left-1.5 lg:after:w-0.5",
        className,
      )}
      {...props}
    />
  );
}

export {
  RailTabsList,
  RailTabsTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
};
