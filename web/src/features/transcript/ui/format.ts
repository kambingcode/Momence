const LANGUAGE_LABELS: Record<string, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};

export function languageLabel(language: string | null): string {
  if (!language) return "Tanpa ucapan";
  return LANGUAGE_LABELS[language] ?? language;
}

/** Durasi jeda singkat: 360 → "0,4 dtk", 8064 → "8,1 dtk". */
export function formatPause(ms: number): string {
  const seconds = (ms / 1000).toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${seconds} dtk`;
}

/** Posisi di video untuk penanda waktu: 7834 → "0:07", 3_725_000 → "1:02:05". */
export function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
