"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchSettings, settingsQueryKey } from "@/features/settings/api";

/**
 * `true` bila ada job yang menunggu worker (`pending`) padahal worker tidak berjalan. Satu kueri
 * dibagi semua pemakai; hanya aktif selama ada job yang menunggu.
 */
export function useWorkerDown(pending: boolean): boolean {
  const settings = useQuery({
    queryKey: settingsQueryKey,
    queryFn: fetchSettings,
    enabled: pending,
    refetchInterval: pending ? 15_000 : false,
  });
  return pending && settings.isSuccess && !settings.data.worker?.online;
}
