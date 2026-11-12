"use client";

import { Film } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDuration } from "./format";

/**
 * Thumbnail proyek dari `GET /api/projects/:id/thumbnail`, mentah tanpa border atau sudut
 * membulat (DESIGN.md → Imagery); permukaan bone + ikon bila belum ada (ingest belum selesai,
 * atau gambar gagal dimuat). Sengaja bukan tautan: judul sudah menjadi tautan ke proyek.
 */
export function ProjectThumbnail({
  projectId,
  hasProxy,
  durationMs,
  size = "sm",
  className,
}: {
  projectId: string;
  /** Thumbnail dibuat dari proxy; tanpa proxy tidak perlu meminta gambar (pasti 404). */
  hasProxy: boolean;
  durationMs: number | null | undefined;
  /** `lg` = kartu grid: ikon & lencana durasi lebih besar. */
  size?: "sm" | "lg";
  className?: string;
}) {
  // Kunci `hasProxy` mengulang percobaan saat proxy baru jadi, setelah gagal dimuat sebelumnya.
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const key = `${projectId}:${hasProxy}`;
  const showImage = hasProxy && failedKey !== key;

  return (
    <div
      className={cn(
        "bg-secondary text-muted-foreground relative flex shrink-0 items-center justify-center overflow-hidden",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- gambar lokal kecil dari route API, tanpa optimasi Next.
        <img
          src={`/api/projects/${encodeURIComponent(projectId)}/thumbnail`}
          alt=""
          loading="lazy"
          onError={() => setFailedKey(key)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <Film className={size === "lg" ? "size-7" : "size-5"} aria-hidden />
      )}
      {durationMs != null && (
        <span
          className={cn(
            "absolute bg-black/70 font-mono text-white tabular-nums",
            size === "lg"
              ? "right-2 bottom-2 rounded-xs px-1.5 text-xs leading-5"
              : "right-0 bottom-0 px-1 text-[10px] leading-4",
          )}
        >
          {formatDuration(durationMs)}
        </span>
      )}
    </div>
  );
}
