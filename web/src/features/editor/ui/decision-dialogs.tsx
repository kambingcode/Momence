"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogEyebrow,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRelativeTime } from "@/features/projects/ui/format";
import { MUST_DECIDE } from "./draft-dialog";

/** Klip dibuka setelah transkrip videonya dibuat ulang: editan lama tidak bisa dipasang. */
export function StaleTranscriptDialog({
  removedCount,
  correctionCount,
  onAcknowledge,
}: {
  removedCount: number;
  correctionCount: number;
  onAcknowledge: () => void;
}) {
  const lost = [
    removedCount > 0 ? `${removedCount} potongan` : null,
    correctionCount > 0 ? `${correctionCount} koreksi` : null,
  ].filter((part) => part !== null);
  return (
    <Dialog open onOpenChange={(open) => !open && onAcknowledge()}>
      <DialogContent>
        <DialogEyebrow>
          Saat membuka klip setelah transkripsi ulang
        </DialogEyebrow>
        <DialogTitle>Transkrip klip ini sudah diperbarui</DialogTitle>
        <DialogDescription>
          Videonya ditranskripsi ulang, jadi
          {lost.length > 0
            ? ` ${lost.join(" dan ")} lama`
            : " editan lama"}{" "}
          tidak bisa dipasang ke teks baru. Editor dimulai dari awal; menyimpan
          akan menimpa editan lama. Caption, Reframe, dan B-roll tetap dipakai.
        </DialogDescription>
        <DialogFooter>
          <Button onClick={onAcknowledge}>Mulai dari transkrip baru</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Simpan ditolak karena versi di server lebih baru (disimpan dari tab/tempat lain). */
export function ConflictDialog({
  updatedAt,
  onOverwrite,
  onLoadLatest,
}: {
  updatedAt: number | null;
  onOverwrite: () => void;
  onLoadLatest: () => void;
}) {
  return (
    <Dialog open>
      <DialogContent {...MUST_DECIDE}>
        <DialogEyebrow>
          Saat menyimpan, versi di server lebih baru
        </DialogEyebrow>
        <DialogTitle>Klip ini disimpan dari tab lain</DialogTitle>
        <DialogDescription>
          Versi dari tempat lain tersimpan{" "}
          {updatedAt === null ? "sebelumnya" : formatRelativeTime(updatedAt)}.
          Pilih satu; versi yang tidak dipilih akan hilang.
        </DialogDescription>
        <DialogFooter className="flex-col">
          <Button onClick={onOverwrite}>Timpa dengan editan ini</Button>
          <Button variant="outline" onClick={onLoadLatest}>
            Muat versi terbaru (buang editan ini)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Simpan ditolak karena transkrip klip berubah sejak editor dibuka. */
export function StaleSaveDialog({
  message,
  onReload,
  onClose,
}: {
  message: string;
  onReload: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogEyebrow>Saat menyimpan, transkrip sudah berubah</DialogEyebrow>
        <DialogTitle>Transkrip berubah sejak editor dibuka</DialogTitle>
        <DialogDescription>{message}</DialogDescription>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Tetap di sini
          </Button>
          <Button onClick={onReload}>Muat ulang editor</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
