"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Target, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import type { DownloadResolution } from "@/shared/schemas";
import {
  UploadAbortedError,
  importVideoFromUrl,
  projectsQueryKey,
  uploadVideo,
} from "../api";
import { ClipFocusField } from "./clip-focus-field";
import { formatBytes } from "./format";
import { looksLikeVideoLink } from "./paste-link";

const ACCEPT = ".mp4,.mov,.m4v,.webm,.mkv,video/*";

/** Kualitas unduhan link (sisi terpendek); 720 ≈ separuh ukuran & waktu unduh. */
const RESOLUTIONS = [1080, 720] as const;

/** Kotak teks/isian sedang difokus: tempelan di sana bukan untuk dialog impor. */
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * Kartu aksi beranda: Upload video (klik atau seret-lepas; progres di kartu), Impor dari link
 * (dialog; menempel link di halaman membukanya terisi), dan Fokus klip (dialog; berlaku untuk
 * upload/impor berikutnya).
 */
export function QuickActions() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [focus, setFocus] = useState("");
  const [focusOpen, setFocusOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");

  const upload = useMutation({
    mutationFn: (file: File) => {
      abortRef.current = new AbortController();
      setProgress(0);
      return uploadVideo(file, setProgress, abortRef.current.signal, focus);
    },
    // Fokus berlaku per video: kosongkan setelah dipakai.
    onSuccess: () => setFocus(""),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: projectsQueryKey }),
  });

  // Tempel link di mana saja (selain kotak isian) → dialog impor terisi.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (isEditable(event.target) || linkOpen || focusOpen) return;
      const text = event.clipboardData?.getData("text") ?? "";
      if (!looksLikeVideoLink(text)) return;
      event.preventDefault();
      setUrl(text.trim());
      setLinkOpen(true);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [linkOpen, focusOpen]);

  function start(file: File | undefined) {
    if (file && !upload.isPending) upload.mutate(file);
  }

  const file = upload.variables;
  const uploadError =
    upload.error && !(upload.error instanceof UploadAbortedError)
      ? upload.error.message
      : null;
  const focusText = focus.trim();

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Upload: seluruh kartu jadi area seret-lepas; saat mengunggah berisi progres. */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!upload.isPending) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            start(e.dataTransfer.files[0]);
          }}
          className="relative"
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            aria-label="Pilih file video"
            onChange={(e) => {
              start(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {upload.isPending && file ? (
            <div
              className="bg-secondary shadow-subtle-3 flex h-full min-h-36 flex-col gap-5 rounded-xl border border-transparent p-5"
              aria-live="polite"
            >
              <ActionIcon>
                <Upload aria-hidden />
              </ActionIcon>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {file.name}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => abortRef.current?.abort()}
                    aria-label="Batalkan upload"
                  >
                    <X aria-hidden />
                    Batal
                  </Button>
                </div>
                <Progress
                  value={progress * 100}
                  aria-label={`Upload ${Math.round(progress * 100)}%`}
                />
                <p className="label-mono text-muted-foreground text-xs tabular-nums">
                  {formatBytes(file.size * progress)} / {formatBytes(file.size)}
                </p>
              </div>
            </div>
          ) : (
            <ActionCard
              icon={<Upload aria-hidden />}
              title={dragging ? "Lepaskan untuk mengunggah" : "Upload video"}
              description="Klik atau seret file ke sini · MP4, MOV, M4V, WebM, MKV"
              onClick={() => inputRef.current?.click()}
              className={cn(
                dragging &&
                  "border-foreground bg-primary-soft/50 border-dashed",
              )}
            />
          )}
        </div>

        <ActionCard
          icon={<Link2 aria-hidden />}
          title="Impor dari link"
          description="YouTube atau VOD Twitch · bisa juga langsung tempel (⌘V) di halaman ini"
          onClick={() => setLinkOpen(true)}
        />

        <ActionCard
          icon={<Target aria-hidden />}
          title="Fokus klip"
          badge={focusText ? "Aktif" : undefined}
          description={
            focusText
              ? `“${focusText}” · berlaku untuk video berikutnya`
              : "Opsional · arahkan momen yang dicari Gemini"
          }
          onClick={() => setFocusOpen(true)}
          className="sm:col-span-2 lg:col-span-1"
        />
      </div>

      {uploadError && (
        <p role="alert" className="text-destructive text-sm">
          {uploadError}
        </p>
      )}

      <ImportLinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        url={url}
        onUrlChange={setUrl}
        focus={focus}
        onFocusChange={setFocus}
        onImported={() => {
          setUrl("");
          setFocus("");
        }}
      />
      <ClipFocusDialog
        open={focusOpen}
        onOpenChange={setFocusOpen}
        value={focus}
        onChange={setFocus}
      />
    </div>
  );
}

function ActionIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-background shadow-subtle-3 flex size-9 items-center justify-center rounded-lg [&_svg]:size-4">
      {children}
    </span>
  );
}

/** Kartu aksi berikon (permukaan bone, garis dalam); seluruh kartu adalah satu tombol. */
function ActionCard({
  icon,
  title,
  description,
  badge,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group bg-secondary shadow-subtle-3 hover:bg-background hover:shadow-sm focus-visible:ring-ring/40 flex h-full w-full cursor-pointer items-center gap-4 rounded-xl border border-transparent p-4 text-left sm:min-h-36 sm:flex-col sm:items-start sm:gap-5 sm:p-5 transition-[background-color,box-shadow] duration-150 outline-none focus-visible:ring-3",
        className,
      )}
    >
      <span className="flex shrink-0 items-start justify-between gap-2 sm:w-full">
        <ActionIcon>{icon}</ActionIcon>
        {badge && (
          <span className="label-mono border-primary-soft rounded-full border px-2 text-xs leading-5 max-sm:hidden">
            {badge}
          </span>
        )}
      </span>
      <span className="min-w-0 space-y-1">
        <span className="block text-base font-medium">{title}</span>
        <span className="text-muted-foreground line-clamp-2 block text-sm">
          {description}
        </span>
      </span>
    </button>
  );
}

/** Dialog impor link: link, kualitas unduhan, dan fokus klip (dibagi dengan kartu Fokus klip). */
function ImportLinkDialog({
  open,
  onOpenChange,
  url,
  onUrlChange,
  focus,
  onFocusChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  onUrlChange: (url: string) => void;
  focus: string;
  onFocusChange: (focus: string) => void;
  onImported: () => void;
}) {
  const queryClient = useQueryClient();
  const [resolution, setResolution] = useState<DownloadResolution>(1080);
  const importUrl = useMutation({
    mutationFn: importVideoFromUrl,
    onSuccess: () => {
      onImported();
      onOpenChange(false);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: projectsQueryKey }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Dialog tetap terbuka selama impor dikirim.
        if (importUrl.isPending) return;
        if (next) importUrl.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim() && !importUrl.isPending)
              importUrl.mutate({
                url,
                clipFocus: focus,
                maxResolution: resolution,
              });
          }}
        >
          <div className="space-y-1.5">
            <DialogTitle>Impor dari link</DialogTitle>
            <DialogDescription>
              Video YouTube (termasuk Shorts dan live yang sudah selesai) atau
              VOD Twitch. Playlist ditolak.
            </DialogDescription>
          </div>

          <div className="space-y-2">
            <label htmlFor="import-url" className="text-sm">
              Link video
            </label>
            <div className="relative">
              <Link2
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              {/* type="text": link tanpa skema (youtu.be/…) ikut diterima. */}
              <Input
                id="import-url"
                type="text"
                inputMode="url"
                autoFocus
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="https://youtube.com/watch?v=…"
                aria-label="Link YouTube atau Twitch"
                aria-invalid={importUrl.isError}
                aria-describedby={
                  importUrl.isError ? "import-url-error" : undefined
                }
                className="h-10 pl-9"
              />
            </div>
            {importUrl.isError && (
              <p
                id="import-url-error"
                role="alert"
                className="text-destructive text-sm"
              >
                {importUrl.error.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p id="import-quality" className="text-sm">
              Kualitas unduhan
            </p>
            <SegmentedControl
              aria-labelledby="import-quality"
              value={String(resolution)}
              onValueChange={(value) =>
                setResolution(Number(value) as DownloadResolution)
              }
              disabled={importUrl.isPending}
              className="w-full max-w-60"
            >
              {RESOLUTIONS.map((value) => (
                <SegmentedControlItem key={value} value={String(value)}>
                  {value}p
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
            <p className="text-muted-foreground text-xs">
              {resolution === 720
                ? "Unduhan ±separuh ukuran dan lebih cepat; hasil export mengikuti sumber sehingga lebih lembut."
                : "Kualitas penuh (bawaan). Pilih 720p untuk stream panjang agar unduhan lebih cepat."}
            </p>
          </div>

          <ClipFocusField
            value={focus}
            onChange={onFocusChange}
            disabled={importUrl.isPending}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={importUrl.isPending}
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={!url.trim() || importUrl.isPending}>
              {importUrl.isPending ? "Mengimpor…" : "Impor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog fokus klip; nilainya langsung dipakai (tanpa tombol simpan terpisah). */
function ClipFocusDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            onOpenChange(false);
          }}
        >
          <div className="space-y-1.5">
            <DialogTitle>Fokus klip</DialogTitle>
            <DialogDescription>
              Berlaku untuk video berikutnya yang Anda upload atau impor, lalu
              dikosongkan lagi.
            </DialogDescription>
          </div>
          <ClipFocusField
            value={value}
            onChange={onChange}
            hint="Gemini mengutamakan momen yang sesuai. Kosongkan untuk pilihan umum."
          />
          <DialogFooter>
            {value.trim() && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onChange("")}
              >
                Kosongkan
              </Button>
            )}
            <Button type="submit">Selesai</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
