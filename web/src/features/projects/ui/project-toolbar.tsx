"use client";

import { ArrowDownUp, LayoutGrid, List, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isProjectSort, type ProjectSort, SORT_LABELS } from "./filter-sort";
import type { ProjectView } from "./view-preferences";

/** Cari judul, urutkan, dan pilih tampilan tabel/kartu. Semuanya berjalan di klien. */
export function ProjectToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  view,
  onViewChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  sort: ProjectSort;
  onSortChange: (sort: ProjectSort) => void;
  view: ProjectView;
  onViewChange: (view: ProjectView) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-40 flex-1 sm:max-w-xs sm:flex-none">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Cari judul proyek…"
          aria-label="Cari proyek"
          className="h-9 pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Hapus pencarian"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/40 absolute top-1/2 right-2 -translate-y-1/2 rounded-xs outline-none focus-visible:ring-2"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-9" aria-label="Urutkan proyek">
            <ArrowDownUp className="size-4" aria-hidden />
            {SORT_LABELS[sort]}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(value) => {
              if (isProjectSort(value)) onSortChange(value);
            }}
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div
        role="group"
        aria-label="Tampilan daftar"
        className="border-border flex h-9 items-stretch gap-1 border-b"
      >
        <ViewTab
          active={view === "cards"}
          label="Tampilan kartu"
          text="Kartu"
          onClick={() => onViewChange("cards")}
        >
          <LayoutGrid className="size-4" aria-hidden />
        </ViewTab>
        <ViewTab
          active={view === "table"}
          label="Tampilan tabel"
          text="Tabel"
          onClick={() => onViewChange("table")}
        >
          <List className="size-4" aria-hidden />
        </ViewTab>
      </div>
    </div>
  );
}

/** Tab gaya Shade: tab aktif hanya bergaris bawah violet 2px (bukan latar pil); teks mono disembunyikan di layar sempit. */
function ViewTab({
  active,
  label,
  text,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  text: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "label-mono focus-visible:ring-ring/40 relative -mb-px flex items-center gap-1.5 rounded-xs px-2.5 transition-colors outline-none focus-visible:ring-2",
        active
          ? "text-foreground after:bg-logo-violet after:absolute after:inset-x-0 after:-bottom-px after:h-0.5"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      <span className="max-sm:sr-only">{text}</span>
    </button>
  );
}
