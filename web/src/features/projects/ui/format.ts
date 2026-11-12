import {
  STORAGE_CATEGORIES,
  type StorageCategory,
  type StorageUsage,
} from "@/modules/projects/application";

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: digits })} ${units[unit]}`;
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const relative = new Intl.RelativeTimeFormat("id", { numeric: "auto" });

export function formatRelativeTime(epochMs: number, now = Date.now()): string {
  const seconds = Math.round((epochMs - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 30],
    ["month", 12],
  ];
  let value = seconds;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return relative.format(value, unit);
    value = Math.round(value / size);
  }
  return relative.format(value, "year");
}

const STORAGE_LABELS: Record<StorageCategory, string> = {
  source: "Video asli",
  proxy: "Pratinjau",
  audio: "Audio",
  renders: "Hasil export",
  other: "Sementara/lainnya",
};

/** Rincian pemakaian disk satu proyek, mis. "Video asli 100 MB · Pratinjau 40 MB". */
export function formatStorageBreakdown(usage: StorageUsage): string {
  return STORAGE_CATEGORIES.filter((c) => usage[c] > 0)
    .map((c) => `${STORAGE_LABELS[c]} ${formatBytes(usage[c])}`)
    .join(" · ");
}
