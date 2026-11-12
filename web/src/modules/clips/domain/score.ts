/** Huruf untuk subskor 0–10 (hook/flow/value/trend) di halaman hasil. */
export type SubscoreTier = "A" | "A-" | "B" | "C";

export function subscoreTier(score: number): SubscoreTier {
  if (score <= 4) return "C";
  if (score <= 6) return "B";
  if (score <= 8) return "A-";
  return "A";
}
