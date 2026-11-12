"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type {
  ProjectListItem,
  StorageUsage,
} from "@/modules/projects/application";
import { deleteProject, projectsQueryKey } from "../api";
import { formatBytes } from "./format";

/** Dialog konfirmasi hapus proyek (menghapus semua file medianya); `open` diatur menu "…" proyek. */
export function DeleteProjectDialog({
  project,
  storage,
  open,
  onOpenChange,
}: {
  project: ProjectListItem;
  storage?: StorageUsage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      onOpenChange(false);
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Dialog tetap terbuka selama penghapusan berjalan.
        if (remove.isPending) return;
        // Galat penghapusan sebelumnya tidak ikut terlihat saat dialog dibuka lagi.
        if (next) remove.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogTitle>Hapus proyek?</AlertDialogTitle>
        <AlertDialogDescription className="break-words">
          “{project.name}” beserta video sumber, proxy, transkrip, klip, editan,
          dan semua MP4 hasil render dihapus permanen dari disk
          {storage
            ? ` (membebaskan ${formatBytes(storage.total)})`
            : project.source
              ? ` (video sumber ${formatBytes(project.source.sizeBytes)})`
              : ""}
          . Tindakan ini tidak bisa dibatalkan.
        </AlertDialogDescription>
        {remove.isError && (
          <p role="alert" className="text-destructive text-sm">
            {remove.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={remove.isPending}>
              Batal
            </Button>
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            <Trash2 className="size-4" aria-hidden />
            {remove.isPending ? "Menghapus…" : "Hapus"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
