"use client";

import { FileText, MoreHorizontal, Scissors, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clipsPath } from "@/features/clips/api";
import { cn } from "@/lib/utils";
import type {
  ProjectListItem,
  StorageUsage,
} from "@/modules/projects/application";
import { DeleteProjectDialog } from "./delete-project-dialog";

/** Skor ≥ ambang ini tampil sebagai pil ber-border lavender. */
const HIGH_SCORE = 90;

/** Menu "…" proyek (tabel & kartu): buka transkrip, lihat klip, hapus (dengan konfirmasi). */
export function ProjectMenu({
  project,
  storage,
  discovered,
  className,
}: {
  project: ProjectListItem;
  storage?: StorageUsage;
  discovered: boolean;
  className?: string;
}) {
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className={cn("text-muted-foreground size-8 shrink-0", className)}
            aria-label={`Menu proyek ${project.name}`}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/projects/${project.id}`}>
              <FileText aria-hidden />
              Buka transkrip
            </Link>
          </DropdownMenuItem>
          {discovered && (
            <DropdownMenuItem asChild>
              <Link href={clipsPath(project.id)}>
                <Scissors aria-hidden />
                Lihat klip
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleting(true)}
          >
            <Trash2 aria-hidden />
            Hapus proyek
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteProjectDialog
        project={project}
        storage={storage}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </>
  );
}

/** Skor terbaik (rawScore × 10); pil ber-border lavender bila ≥ 90, selain itu chip bone. */
export function ScorePill({
  score,
  label,
  className,
}: {
  score: number;
  /** Nama untuk pembaca layar & tooltip bila tidak ada kepala kolom (mis. "Skor terbaik"). */
  label?: string;
  className?: string;
}) {
  return (
    <Badge
      variant={score >= HIGH_SCORE ? "lavender" : "secondary"}
      className={cn("min-w-9 tabular-nums", className)}
      title={label ? `${label} ${score}` : undefined}
      aria-label={label ? `${label} ${score}` : undefined}
    >
      {score}
    </Badge>
  );
}
