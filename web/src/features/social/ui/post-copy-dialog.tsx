"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Hash, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogEyebrow,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import { jobsPollInterval } from "@/features/jobs/poll";
import {
  type PostCopyResult,
  type PostLanguageChoice,
  type PostPlatform,
  postCopyPayloadSchema,
} from "@/shared/schemas";
import { fetchPostCopy, postCopyQueryKey, startPostCopy } from "../api";
import { fullPost, hashtagLine, PLATFORM_LABELS } from "../format";

const PLATFORMS: PostPlatform[] = ["tiktok", "reels", "shorts"];

const LANGUAGES: { value: PostLanguageChoice; label: string }[] = [
  { value: "auto", label: "Sama dengan video" },
  { value: "id", label: "Indonesia" },
  { value: "en", label: "English" },
];

interface PostCopyButtonProps {
  clipId: string;
  clipTitle: string;
}

/**
 * Tombol "Caption" di kartu klip: dialog untuk meminta Gemini menulis caption + hashtag posting
 * dari ucapan klip (satu panggilan kecil per permintaan, bukan per klip), lalu menyalinnya.
 */
export function PostCopyButton({ clipId, clipTitle }: PostCopyButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title="Buat caption & hashtag untuk diposting"
        >
          <Hash aria-hidden />
          Caption
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <PostCopyBody clipId={clipId} clipTitle={clipTitle} open={open} />
      </DialogContent>
    </Dialog>
  );
}

function PostCopyBody({
  clipId,
  clipTitle,
  open,
}: PostCopyButtonProps & { open: boolean }) {
  const queryClient = useQueryClient();
  const [platformChoice, setPlatformChoice] = useState<PostPlatform | null>(
    null,
  );
  const [languageChoice, setLanguageChoice] =
    useState<PostLanguageChoice | null>(null);

  const query = useQuery({
    queryKey: postCopyQueryKey(clipId),
    queryFn: () => fetchPostCopy(clipId),
    enabled: open,
    refetchInterval: (q) => {
      const job = q.state.data?.job;
      return q.state.data?.status === "pending" && job
        ? jobsPollInterval([job])
        : false;
    },
  });
  const state = query.data;
  // Pilihan pengguna menang; sebelum memilih, ikuti platform hasil terakhir.
  const platform = platformChoice ?? state?.copy?.platform ?? "tiktok";
  // Bahasa permintaan terakhir diingat lewat payload job-nya (hasil tidak memuat bahasa).
  const lastLanguage = postCopyPayloadSchema.safeParse(state?.job?.payload).data
    ?.language;
  const language = languageChoice ?? lastLanguage ?? "auto";

  const start = useMutation({
    mutationFn: () => startPostCopy(clipId, { platform, language }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: postCopyQueryKey(clipId) }),
  });
  const pending = state?.status === "pending";
  const busy = query.isPending || pending || start.isPending;
  const ready = state?.status === "ready";

  return (
    <>
      <DialogEyebrow>Caption & hashtag</DialogEyebrow>
      <DialogTitle className="leading-snug">{clipTitle}</DialogTitle>
      <DialogDescription>
        Gemini menulis caption dan hashtag dari ucapan klip ini. Setiap
        permintaan memanggil Gemini sekali (berbayar, kecil). Hashtag berdasar
        isi klip, bukan data tren hari ini.
      </DialogDescription>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <p className="label-mono text-muted-foreground">Platform</p>
          <SegmentedControl
            value={platform}
            onValueChange={(value) => setPlatformChoice(value as PostPlatform)}
            aria-label="Platform"
            disabled={busy}
          >
            {PLATFORMS.map((value) => (
              <SegmentedControlItem key={value} value={value}>
                {PLATFORM_LABELS[value]}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
        <div className="space-y-1.5">
          <p className="label-mono text-muted-foreground">Bahasa caption</p>
          <SegmentedControl
            value={language}
            onValueChange={(value) =>
              setLanguageChoice(value as PostLanguageChoice)
            }
            aria-label="Bahasa caption"
            disabled={busy}
          >
            {LANGUAGES.map(({ value, label }) => (
              <SegmentedControlItem key={value} value={value}>
                {label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
        <Button
          type="button"
          onClick={() => start.mutate()}
          disabled={busy}
          className="w-full"
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : ready ? (
            <RotateCcw aria-hidden />
          ) : (
            <Sparkles aria-hidden />
          )}
          {ready ? "Buat ulang" : "Buat caption"}
        </Button>
      </div>

      <div aria-live="polite" className="space-y-3">
        {query.isError && (
          <p role="alert" className="text-destructive text-sm">
            Gagal memuat caption: {query.error.message}
          </p>
        )}
        {start.error && (
          <p role="alert" className="text-destructive text-sm">
            {start.error.message}
          </p>
        )}
        {pending && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {state?.job?.status === "queued"
              ? "Menunggu worker… (jalankan uv run worker run bila tidak bergerak)"
              : "Gemini sedang menulis…"}
          </p>
        )}
        {state?.status === "failed" && (
          <p role="alert" className="text-destructive text-sm">
            Gagal membuat caption:{" "}
            {state.job?.error ?? "hasil job tidak bisa dibaca"}
          </p>
        )}
        {ready && state.copy && <PostCopyResultView copy={state.copy} />}
      </div>
    </>
  );
}

function PostCopyResultView({ copy }: { copy: PostCopyResult }) {
  return (
    <div className="space-y-3">
      <p className="label-mono text-muted-foreground">
        Untuk {PLATFORM_LABELS[copy.platform]}
      </p>
      <CopyBlock label="Caption" text={copy.caption} />
      {copy.altCaption && (
        <CopyBlock label="Varian (uji A/B)" text={copy.altCaption} />
      )}
      {copy.hashtags.length > 0 && (
        <CopyBlock label="Hashtag" text={hashtagLine(copy)} />
      )}
      <CopyBlock
        label="Siap posting"
        text={fullPost(copy)}
        hint="Caption + hashtag"
      />
    </div>
  );
}

function CopyBlock({
  label,
  text,
  hint,
}: {
  label: string;
  text: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  };
  return (
    <div className="border-border space-y-1.5 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          {label}
          {hint && (
            <span className="text-muted-foreground text-xs"> · {hint}</span>
          )}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copy}
          aria-label={`Salin ${label.toLowerCase()}`}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Tersalin" : "Salin"}
        </Button>
      </div>
      <p className="text-sm break-words whitespace-pre-wrap">{text}</p>
      {failed && (
        <p role="alert" className="text-destructive text-xs">
          Tidak bisa menyalin otomatis; pilih teksnya dan salin manual.
        </p>
      )}
    </div>
  );
}
