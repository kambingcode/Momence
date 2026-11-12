import { errorMessage } from "@/features/projects/api";
import type { SettingsOverview } from "@/modules/settings/application";
import type { Preferences } from "@/shared/schemas";

export const settingsQueryKey = ["settings"] as const;

export async function fetchSettings(): Promise<SettingsOverview> {
  const response = await fetch("/api/settings", { cache: "no-store" });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as SettingsOverview;
}

export async function savePreferences(
  preferences: Preferences,
): Promise<Preferences> {
  const response = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return ((await response.json()) as { preferences: Preferences }).preferences;
}
