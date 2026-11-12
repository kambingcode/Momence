"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { projectsQueryKey } from "@/features/projects/api";
import { ClipFocusField } from "@/features/projects/ui/clip-focus-field";
import { projectQueryKey } from "@/features/transcript/api";
import { rediscoverClips } from "../api";

/**
 * Dialog "Cari ulang klip": ubah fokus klip lalu minta pencarian klip diulang dari transkrip
 * yang sama. Klip yang sudah diedit tetap dipertahankan; selebihnya diganti hasil baru.
 */
export function RediscoverDialog({
  projectId,
  initialFocus,
  open,
  onOpenChange,
}: {
  projectId: string;
  initialFocus: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [focus, setFocus] = useState(initialFocus ?? "");
  const rediscover = useMutation({
    mutationFn: () => rediscoverClips(projectId, focus),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: projectQueryKey(projectId),
      });
      await queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Dialog tetap terbuka selama permintaan berjalan.
        if (rediscover.isPending) return;
        if (next) {
          // Buka lagi: isi ulang dari fokus tersimpan, tanpa galat lama.
          rediscover.reset();
          setFocus(initialFocus ?? "");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogTitle>Cari ulang klip</DialogTitle>
        <DialogDescription>
          Gemini membaca transkrip lagi dengan fokus di bawah. Klip yang sudah
          Anda edit tetap dipertahankan; klip lainnya diganti hasil pencarian
          baru. Pencarian memanggil Gemini untuk seluruh transkrip (berbayar).
        </DialogDescription>
        <ClipFocusField
          value={focus}
          onChange={setFocus}
          disabled={rediscover.isPending}
        />
        {rediscover.isError && (
          <p role="alert" className="text-destructive text-sm">
            {rediscover.error.message}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={rediscover.isPending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            disabled={rediscover.isPending}
            onClick={() => rediscover.mutate()}
          >
            {rediscover.isPending ? "Memproses…" : "Cari ulang"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
