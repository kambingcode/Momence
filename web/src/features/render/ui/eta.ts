/** Progres minimum sebelum estimasi dipercaya (di bawahnya terlalu goyah). */
const MIN_PROGRESS = 5;

/** Sisa waktu render (ms) dari laju sejauh ini; `null` bila belum bisa ditaksir. */
export function renderEtaMs(
  startedAt: number | null,
  progress: number,
  now: number,
): number | null {
  if (startedAt === null || progress < MIN_PROGRESS || progress >= 100)
    return null;
  const elapsed = now - startedAt;
  if (elapsed <= 0) return null;
  return Math.round((elapsed * (100 - progress)) / progress);
}

/** "± 2 mnt" / "± 40 dtk"; `null` bila tak ada estimasi. */
export function formatEta(ms: number | null): string | null {
  if (ms === null) return null;
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `± ${Math.max(5, Math.round(seconds / 5) * 5)} dtk`;
  return `± ${Math.round(seconds / 60)} mnt`;
}
