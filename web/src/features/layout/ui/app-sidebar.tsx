"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderOpen, HardDrive, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fetchStorage, storageQueryKey } from "@/features/projects/api";
import {
  formatBytes,
  formatRelativeTime,
  formatStorageBreakdown,
} from "@/features/projects/ui/format";
import { fetchSettings, settingsQueryKey } from "@/features/settings/api";

interface NavItem {
  href: string;
  label: string;
  icon: typeof FolderOpen;
  /** Halaman di bawah item ini (untuk keadaan aktif). */
  matches: (pathname: string) => boolean;
}

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Proyek",
    icon: FolderOpen,
    matches: (path) => path === "/" || path.startsWith("/projects"),
  },
  {
    href: "/settings",
    label: "Pengaturan",
    icon: Settings,
    matches: (path) => path.startsWith("/settings"),
  },
];

/**
 * Navigasi aplikasi. Di `lg+`: sidebar kiri (bone, hairline kanan) berisi logo, menu, lalu
 * penyimpanan & status worker di bawah. Di bawahnya: bar atas ringkas (logo + menu).
 */
export function AppSidebar() {
  const pathname = usePathname();
  return (
    <>
      {/* Kolom bone setinggi halaman; isinya lekat setinggi layar. */}
      <div className="bg-sidebar hidden w-60 shrink-0 border-r lg:block">
        <aside
          aria-label="Navigasi utama"
          className="sticky top-0 flex h-dvh flex-col"
        >
          <div className="px-6 pt-7 pb-8">
            <Link
              href="/"
              className="focus-visible:ring-ring/40 rounded-xs outline-none focus-visible:ring-3"
            >
              <BrandMark />
            </Link>
          </div>
          <nav aria-label="Menu" className="flex-1 px-3">
            <ul className="space-y-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={item.matches(pathname)} />
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-4 border-t px-6 py-5">
            <StorageStatus />
            <WorkerStatus />
          </div>
        </aside>
      </div>

      <header className="bg-background sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-4 lg:hidden">
        <Link
          href="/"
          className="focus-visible:ring-ring/40 mr-auto rounded-xs outline-none focus-visible:ring-3"
        >
          <BrandMark className="text-xl" />
        </Link>
        <nav aria-label="Menu">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={item.matches(pathname)} compact />
              </li>
            ))}
          </ul>
        </nav>
      </header>
    </>
  );
}

/** Item aktif = isi putih + garis dalam hairline + bobot 500; bukan violet. */
function NavLink({
  item,
  active,
  compact = false,
}: {
  item: NavItem;
  active: boolean;
  compact?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={compact ? item.label : undefined}
      className={cn(
        "focus-visible:ring-ring/40 flex items-center gap-3 rounded-lg text-sm transition-colors duration-150 outline-none focus-visible:ring-3",
        // Bar atas (layar sentuh): target 44px.
        compact
          ? "h-11 min-w-11 justify-center px-3 max-sm:gap-0"
          : "h-10 px-3",
        active
          ? "bg-background shadow-subtle-3 text-foreground font-medium"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className={cn(compact && "max-sm:sr-only")}>{item.label}</span>
    </Link>
  );
}

/** "1,2 GB dipakai" + sisa disk; rincian per kategori di tooltip. */
function StorageStatus() {
  // Kunci yang sama dengan dashboard: polling dashboard selama job berjalan ikut memperbarui ini.
  const storage = useQuery({
    queryKey: storageQueryKey,
    queryFn: fetchStorage,
  });
  if (!storage.data) return null;
  const { total, disk } = storage.data;
  const breakdown = formatStorageBreakdown(total);
  const body = (
    <div className="flex items-start gap-2.5 text-sm">
      <HardDrive
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="tabular-nums">{formatBytes(total.total)} dipakai</p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {formatBytes(disk.freeBytes)} tersisa di disk
        </p>
      </div>
    </div>
  );
  if (!breakdown) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Bisa difokus agar rinciannya juga terjangkau lewat keyboard. */}
        <div
          tabIndex={0}
          aria-label={`Penyimpanan: ${formatBytes(total.total)} dipakai, ${formatBytes(disk.freeBytes)} tersisa di disk`}
          className="focus-visible:ring-ring/40 -m-1 rounded-xs p-1 outline-none focus-visible:ring-3"
        >
          {body}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">{breakdown}</TooltipContent>
    </Tooltip>
  );
}

/** Titik penuh = worker berjalan, titik kosong = tidak berjalan (bentuk, bukan warna). */
function WorkerStatus() {
  const settings = useQuery({
    queryKey: settingsQueryKey,
    queryFn: fetchSettings,
    refetchInterval: 30_000,
  });
  if (!settings.data) return null;
  const { worker } = settings.data;
  const online = worker?.online ?? false;
  const hint = !worker
    ? "Belum pernah berjalan. Jalankan uv run worker run di worker/."
    : worker.online
      ? `Aktif ${formatRelativeTime(worker.heartbeatAt)}`
      : `Terakhir aktif ${formatRelativeTime(worker.stoppedAt ?? worker.heartbeatAt)}. Jalankan uv run worker run di worker/.`;
  return (
    <Link
      href="/settings"
      title={hint}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/40 -m-1 flex items-center gap-2.5 rounded-xs p-1 text-sm outline-none focus-visible:ring-3"
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            online ? "bg-foreground" : "border-foreground border-[1.5px]",
          )}
        />
      </span>
      {online ? "Worker berjalan" : "Worker tidak berjalan"}
    </Link>
  );
}
