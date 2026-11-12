import { ArrowLeft, Keyboard } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDuration } from "@/features/projects/ui/format";

/** Skor dari ambang ini tampil sebagai pil lavender; di bawahnya chip bone. */
const HIGH_SCORE = 90;

/**
 * Header editor, tiga zona: identitas klip (kiri), riwayat (`history`, tengah-kanan), status
 * simpan & export (`actions`, kanan). Judul satu baris berelipsis; zona kanan tidak berubah
 * lebar antar keadaan sehingga tidak ada lompatan layout.
 */
export function EditorHeader({
  back,
  title,
  score,
  originalMs,
  editedMs,
  sourceName,
  history,
  onShowShortcuts,
  actions,
}: {
  back: { href: string; label: string };
  title: string;
  score: number | null;
  originalMs: number;
  editedMs: number;
  sourceName: string | null;
  history: React.ReactNode;
  onShowShortcuts: () => void;
  actions: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5">
      <Link
        href={back.href}
        className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-sm whitespace-nowrap"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {back.label}
      </Link>
      <div
        className="bg-border hidden h-9 w-px shrink-0 md:block"
        aria-hidden
      />
      <div className="min-w-0 flex-1 basis-40 space-y-1">
        <h1
          className="truncate text-lg leading-tight font-medium"
          title={title}
        >
          {title}
        </h1>
        <div className="flex min-w-0 items-center gap-2">
          {score !== null && (
            <Badge variant={score >= HIGH_SCORE ? "lavender" : "secondary"}>
              Skor {score}
            </Badge>
          )}
          <p className="label-mono text-muted-foreground shrink-0 whitespace-nowrap tabular-nums">
            {formatDuration(originalMs)}
            {formatDuration(editedMs) !== formatDuration(originalMs) && (
              <>
                {" → "}
                <span className="text-foreground" data-testid="edited-duration">
                  {formatDuration(editedMs)}
                </span>
              </>
            )}
          </p>
          {sourceName && (
            <p
              className="text-muted-foreground hidden min-w-0 truncate text-xs sm:block"
              title={sourceName}
            >
              {sourceName}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {history}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Pintasan keyboard"
              onClick={onShowShortcuts}
            >
              <Keyboard aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Pintasan keyboard
            <Kbd>?</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 ml-auto lg:flex-nowrap xl:w-[33rem]">
        {actions}
      </div>
    </header>
  );
}
