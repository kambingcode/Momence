import { errorMessage } from "@/features/projects/api";
import type { ClipBrollPlan } from "@/modules/broll/application";
import type { Job } from "@/modules/jobs/application";
import type {
  AspectRatio,
  BrollPlanBody,
  StockSearchResult,
} from "@/shared/schemas";

export const brollPlanQueryKey = (clipId: string) =>
  ["clips", clipId, "broll-plan"] as const;

const brollPlanUrl = (clipId: string) =>
  `/api/clips/${encodeURIComponent(clipId)}/broll-plan`;

export async function fetchBrollPlan(clipId: string): Promise<ClipBrollPlan> {
  const response = await fetch(brollPlanUrl(clipId), { cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as ClipBrollPlan;
}

/** Antre rencana B-roll dari editan yang sedang dibuka; gagal → Error berpesan untuk pengguna. */
export async function startBrollPlan(
  clipId: string,
  body: BrollPlanBody,
): Promise<Job> {
  const response = await fetch(brollPlanUrl(clipId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return ((await response.json()) as { job: Job }).job;
}

export const stockSearchQueryKey = (query: string, ratio: AspectRatio) =>
  ["broll", "search", ratio, query] as const;

/** Cari video stok (Pixabay); gagal (mis. key belum diisi) → Error berpesan untuk pengguna. */
export async function searchStockVideos(
  query: string,
  ratio: AspectRatio,
  page: number,
): Promise<StockSearchResult> {
  const params = new URLSearchParams({ q: query, ratio, page: String(page) });
  const response = await fetch(`/api/broll/search?${params}`);
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as StockSearchResult;
}
