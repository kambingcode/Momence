"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { jobsPollInterval } from "@/features/jobs/poll";
import { PipelineSteps } from "@/features/jobs/ui/pipeline-steps";
import {
  fetchProject,
  fetchTranscript,
  ProjectNotFoundError,
  projectQueryKey,
  proxyUrl,
  transcriptQueryKey,
} from "../api";
import { languageLabel } from "./format";
import { TranscriptText } from "./transcript-text";
import { useActiveToken } from "./use-active-token";

const NO_TOKENS: never[] = [];

/** Tab "Transkrip" halaman proyek; kepala proyek & tab ada di `ProjectFrame` (layout). */
export function TranscriptPage({ projectId }: { projectId: string }) {
  const project = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
    // Polling selama ingest/transcribe/discover belum selesai.
    refetchInterval: (query) => jobsPollInterval(query.state.data?.jobs),
    retry: (count, error) =>
      !(error instanceof ProjectNotFoundError) && count < 1,
  });
  const transcribe = project.data?.jobs.find((j) => j.type === "transcribe");
  const transcriptReady = transcribe?.status === "done";
  const transcript = useQuery({
    queryKey: transcriptQueryKey(projectId, transcribe?.finishedAt ?? null),
    queryFn: () => fetchTranscript(projectId),
    enabled: transcriptReady,
  });

  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const tokens = transcript.data?.tokens ?? NO_TOKENS;
  const activeIndex = useActiveToken(video, tokens);
  const seek = useCallback(
    (timeMs: number) => {
      // +1 ms: hindari pembulatan float yang jatuh tepat sebelum awal kata.
      if (video) video.currentTime = (timeMs + 1) / 1000;
    },
    [video],
  );
  const counts = useMemo(
    () => ({
      words: tokens.filter((t) => t.type !== "pause").length,
      fillers: tokens.filter((t) => t.type === "filler").length,
      pauses: tokens.filter((t) => t.type === "pause").length,
    }),
    [tokens],
  );

  // Proyek belum termuat / tidak ada: pesan ditampilkan kepala proyek (layout).
  if (!project.data) return null;

  const { source, jobs } = project.data;
  const portrait =
    source?.width && source.height && source.height > source.width;

  if (!transcriptReady)
    return (
      <PipelineSteps
        jobs={jobs}
        waitingFor="Transkrip muncul di sini setelah transkripsi selesai. Halaman ini diperbarui otomatis."
      />
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section aria-label="Video" className="lg:sticky lg:top-6 lg:self-start">
        {source?.proxyPath ? (
          <video
            ref={setVideo}
            src={proxyUrl(projectId)}
            controls
            preload="metadata"
            playsInline
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            className="w-full rounded-xl bg-black"
            style={{
              aspectRatio:
                source.width && source.height
                  ? `${source.width} / ${source.height}`
                  : "16 / 9",
              maxHeight: portrait ? "70dvh" : undefined,
            }}
          />
        ) : (
          <div className="bg-secondary text-muted-foreground flex aspect-video items-center justify-center rounded-xl text-sm">
            Video pratinjau sedang disiapkan…
          </div>
        )}
        <p className="text-muted-foreground mt-3 text-xs">
          Klik kata mana pun untuk melompat ke bagian itu di video.
        </p>
      </section>

      <section
        aria-labelledby="transcript-heading"
        className="min-w-0 space-y-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="transcript-heading" className="sr-only">
            Transkrip
          </h2>
          {transcript.data && (
            <>
              <Badge variant="secondary">
                {languageLabel(transcript.data.language)}
              </Badge>
              <span className="label-mono text-muted-foreground text-sm tabular-nums">
                {counts.words} kata · {counts.fillers} kata pengisi ·{" "}
                {counts.pauses} jeda
              </span>
            </>
          )}
        </div>

        {transcript.isPending ? (
          <p className="text-muted-foreground text-sm">Memuat transkrip…</p>
        ) : transcript.isError ? (
          <p role="alert" className="text-destructive text-sm">
            Gagal memuat transkrip: {transcript.error.message}
          </p>
        ) : !transcript.data ? (
          <p className="text-muted-foreground text-sm">
            Transkrip belum tersedia.
          </p>
        ) : counts.words === 0 ? (
          <p className="text-muted-foreground text-sm">
            Tidak ada ucapan terdeteksi di video ini.
          </p>
        ) : (
          <TranscriptText
            tokens={tokens}
            activeIndex={activeIndex}
            onSeek={seek}
            follow={playing}
          />
        )}
      </section>
    </div>
  );
}
