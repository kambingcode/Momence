/**
 * Rapikan daftar filler dari pengguna: spasi dirapatkan, entri kosong dibuang, entri ganda (tanpa
 * membedakan huruf besar/kecil) hanya disimpan yang pertama. Urutan tulisan pengguna dipertahankan.
 */
export function normalizeEntries(entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    const text = entry.trim().replace(/\s+/gu, " ");
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

/**
 * Worker dianggap mati bila detak terakhirnya lebih tua dari ini. Worker menulis detak tiap
 * ±30 dtk dari thread terpisah (tetap berdetak selama job berat berjalan).
 */
export const WORKER_STALE_MS = 90_000;

export function isWorkerOnline(
  status: { heartbeatAt: number; stoppedAt: number | null },
  nowMs: number,
): boolean {
  return (
    status.stoppedAt === null && nowMs - status.heartbeatAt <= WORKER_STALE_MS
  );
}
