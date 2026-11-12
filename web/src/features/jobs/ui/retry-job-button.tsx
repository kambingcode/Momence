"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Job } from "@/modules/jobs/application";
import { useRetryJob } from "../use-retry-job";

/** Tombol "Coba lagi" untuk job gagal, dengan pesan bila antre ulang gagal. */
export function RetryJobButton({ job }: { job: Pick<Job, "id"> }) {
  const retry = useRetryJob(job);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => retry.mutate()}
        disabled={retry.isPending}
      >
        <RotateCcw className="size-3.5" aria-hidden />
        {retry.isPending ? "Mengulang…" : "Coba lagi"}
      </Button>
      {retry.isError && (
        <span role="alert" className="text-destructive text-xs">
          {retry.error.message}
        </span>
      )}
    </>
  );
}
