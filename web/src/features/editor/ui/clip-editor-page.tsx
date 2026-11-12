"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Captions,
  Clapperboard,
  Crop,
  SquarePlay,
  Type,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { useToast } from "@/components/ui/toast";
import {
  RailTabsList,
  RailTabsTrigger,
  Tabs,
  TabsContent,
} from "@/components/ui/tabs";
import { clipsPath } from "@/features/clips/api";
import { jobsPollInterval } from "@/features/jobs/poll";
import { formatDuration } from "@/features/projects/ui/format";
import { ProjectShell as Shell } from "@/features/projects/ui/project-shell";
import {
  fetchClipReframe,
  reframeQueryKey,
  startClipReframe,
} from "@/features/reframe/api";
import {
  fetchProject,
  projectQueryKey,
  proxyUrl,
} from "@/features/transcript/api";
import type { ClipEditorData } from "@/modules/editor/application";
import { composeClip, compositionSize } from "@/modules/render/application";
import { tokenIndexAt } from "@/modules/transcript/application";
import { defaultReframe } from "@/shared/schemas";
import {
  ClipNotFoundError,
  editorQueryKey,
  fetchClipEditor,
  saveEditingScript,
} from "../api";
import {
  createEditorStore,
  docKey,
  docOf,
  type EditorDoc,
  type EditorStore,
  EditorStoreContext,
} from "./editor-store";
import { ClipMap } from "./clip-map";
import { ClipPreview, type ClipPreviewHandle } from "./clip-preview";
import {
  ConflictDialog,
  StaleSaveDialog,
  StaleTranscriptDialog,
} from "./decision-dialogs";
import { type Draft, draftDecision, readDraft, removeDraft } from "./draft";
import { DraftDialog } from "./draft-dialog";
import { BrollPanel } from "./broll-panel";
import { CaptionPanel } from "./caption-panel";
import { EditorHeader } from "./editor-header";
import { EditorShell } from "./editor-shell";
import { ExportControl } from "./export-control";
import { EditorToolbar } from "./editor-toolbar";
import { isInOverlay, isShortcutsHelpKey } from "./keyboard";
import { createPlayhead } from "./playhead-store";
import { ReframePanel } from "./reframe-panel";
import { SaveControls, saveStatusOf } from "./save-controls";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { SpeechCleanupPanel } from "./speech-cleanup-panel";
import { TextOverlayEditor } from "./text-overlay-editor";
import { TextPanel } from "./text-panel";
import { TranscriptEditor } from "./transcript-editor";
import { TranscriptLegend } from "./transcript-legend";
import { TranscriptToolbar } from "./transcript-toolbar";
import { useDraftAutosave } from "./use-draft-autosave";

type EditorPanel = "cleanup" | "caption" | "reframe" | "broll" | "text";
/** Panel alat di rail kanan; `description` tampil di kepala panel. */
const PANELS: {
  id: EditorPanel;
  label: string;
  description: string;
  icon: typeof Captions;
}[] = [
  {
    id: "cleanup",
    label: "Rapikan",
    description: "Hapus jeda, kata pengisi, dan kata berulang.",
    icon: WandSparkles,
  },
  {
    id: "caption",
    label: "Caption",
    description: "Gaya animasi, font, posisi, dan warna caption.",
    icon: Captions,
  },
  {
    id: "reframe",
    label: "Reframe",
    description: "Rasio, tata letak, dan pelacakan wajah.",
    icon: Crop,
  },
  {
    id: "broll",
    label: "B-roll",
    description: "Video stok di atas klip pada momen yang cocok.",
    icon: Clapperboard,
  },
  {
    id: "text",
    label: "Teks",
    description: "Teks custom di atas video.",
    icon: Type,
  },
];

/** Kepala panel aktif: judul + satu kalimat penjelas. */
function PanelHeading({ id }: { id: EditorPanel }) {
  const panel = PANELS.find((p) => p.id === id)!;
  return (
    <div className="space-y-0.5 border-b px-4 py-3">
      <h2 className="text-base font-medium">{panel.label}</h2>
      <p className="text-muted-foreground text-xs">{panel.description}</p>
    </div>
  );
}

const EMPTY_DOC: EditorDoc = {
  removed: [],
  corrections: {},
  caption: null,
  reframe: defaultReframe(),
  broll: [],
  textOverlays: [],
};

export function ClipEditorPage({
  projectId,
  clipId,
}: {
  projectId: string;
  clipId: string;
}) {
  const back = { href: clipsPath(projectId), label: "Semua klip" };
  const project = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const editor = useQuery({
    queryKey: editorQueryKey(clipId),
    queryFn: () => fetchClipEditor(clipId),
    // Editor memegang state sendiri setelah dimuat; jangan dimuat ulang diam-diam.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: (count, error) => !(error instanceof ClipNotFoundError) && count < 1,
  });

  if (editor.isPending || project.isPending)
    return <Shell back={back}>Memuat…</Shell>;
  if (editor.isError || project.isError) {
    const error = editor.error ?? project.error;
    return (
      <Shell back={back}>
        <p role="alert" className="text-destructive">
          {error instanceof ClipNotFoundError
            ? "Klip tidak ditemukan."
            : `Gagal memuat editor: ${error?.message}`}
        </p>
      </Shell>
    );
  }

  const { source } = project.data;
  return (
    <EditorShell>
      <EditorWorkspace
        data={editor.data}
        back={back}
        sourceDurationMs={source?.durationMs ?? null}
        sourceName={
          source && !/^https?:\/\//.test(source.originalName)
            ? source.originalName
            : project.data.name
        }
        videoSrc={source?.proxyPath ? proxyUrl(projectId) : null}
      />
    </EditorShell>
  );
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | {
      kind: "conflict";
      message: string;
      currentVersion: number | null;
      current: EditorDoc | null;
      currentUpdatedAt: number | null;
    }
  | { kind: "stale"; message: string };

/** Isi dokumen yang tersimpan di server (apa adanya, termasuk bila usang). */
function serverDoc(data: ClipEditorData): EditorDoc {
  const script = data.editingScript?.script;
  return script ? docOf(script) : EMPTY_DOC;
}

/**
 * Dokumen awal: editan tersimpan. Bila editan itu usang (transkrip berubah), potongan & koreksi
 * dikosongkan; gaya caption, reframe, B-roll & teks tidak merujuk token sehingga tetap dipakai.
 */
function initialDoc(data: ClipEditorData): EditorDoc {
  const doc = serverDoc(data);
  return data.stale
    ? {
        ...EMPTY_DOC,
        caption: doc.caption,
        reframe: doc.reframe,
        broll: doc.broll,
        textOverlays: doc.textOverlays,
      }
    : doc;
}

function EditorWorkspace({
  data,
  back,
  sourceName,
  sourceDurationMs,
  videoSrc,
}: {
  data: ClipEditorData;
  back: { href: string; label: string };
  sourceName: string | null;
  sourceDurationMs: number | null;
  videoSrc: string | null;
}) {
  const { clip, tokens } = data;
  const [store] = useState<EditorStore>(() =>
    createEditorStore(initialDoc(data)),
  );
  const removed = useStore(store, (s) => s.removed);
  const corrections = useStore(store, (s) => s.corrections);
  const caption = useStore(store, (s) => s.caption);
  const reframe = useStore(store, (s) => s.reframe);
  const broll = useStore(store, (s) => s.broll);
  const textOverlays = useStore(store, (s) => s.textOverlays);

  // Status analisis wajah; dipoll selama job reframe klip ini antre/berjalan.
  const queryClient = useQueryClient();
  const reframeState = useQuery({
    queryKey: reframeQueryKey(clip.id),
    queryFn: () => fetchClipReframe(clip.id),
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      return query.state.data?.status === "pending" && job
        ? jobsPollInterval([job])
        : false;
    },
  });
  const analyze = useMutation({
    mutationFn: () => startClipReframe(clip.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: reframeQueryKey(clip.id) }),
  });
  // Jalur crop terbaru (analisis bisa selesai saat editor terbuka) atau yang dimuat bersama editor.
  const cropTracks = reframeState.data
    ? reframeState.data.cropTracks
    : data.cropTracks;

  // Versi & isi terakhir di server: dasar Save dan penanda "belum disimpan".
  const [baseVersion, setBaseVersion] = useState(
    data.editingScript?.version ?? null,
  );
  const [savedKey, setSavedKey] = useState(() => docKey(serverDoc(data)));

  // Draft lokal: diputuskan sekali saat editor dibuka. `undefined` = belum diperiksa;
  // selama itu (dan selama dialog terbuka) autosave mati agar draft tidak tertimpa.
  const [draftOffer, setDraftOffer] = useState<Draft | null | undefined>();
  useEffect(() => {
    const draft = readDraft(data.clip.id);
    const decision = draftDecision(draft, {
      doc: serverDoc(data),
      updatedAt: data.editingScript?.updatedAt ?? null,
      transcriptFingerprint: data.transcriptFingerprint,
    });
    if (decision === "discard") removeDraft(data.clip.id);
    setDraftOffer(decision === "offer" ? draft : null);
  }, [data]);
  useDraftAutosave(store, {
    clipId: clip.id,
    baseVersion,
    savedKey,
    transcriptFingerprint: data.transcriptFingerprint,
    enabled: draftOffer === null,
  });
  const continueDraft = (draft: Draft) => {
    store.getState().replaceDoc(docOf(draft));
    // Riwayat undo dimulai dari draft; dasar Save = versi saat draft ditulis, sehingga Save
    // dari tab lain di antaranya memicu konflik, bukan ditimpa diam-diam.
    store.temporal.getState().clear();
    setBaseVersion(draft.baseVersion);
    setDraftOffer(null);
  };
  const discardDraft = () => {
    removeDraft(clip.id);
    setDraftOffer(null);
  };
  const dirty =
    docKey({ removed, corrections, caption, reframe, broll, textOverlays }) !==
    savedKey;
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const { toast, dismiss } = useToast();
  const saveToast = useRef<string | null>(null);
  const retrySave = useRef<() => void>(() => {});
  const [hideRemoved, setHideRemoved] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Dialog "transkrip diperbarui" ditampilkan dulu; dialog draft menunggu sampai dikonfirmasi.
  const [staleAcknowledged, setStaleAcknowledged] = useState(false);

  const { timeline, props: composition } = useMemo(
    () =>
      composeClip({
        range: clip,
        tokens,
        removed,
        corrections,
        caption,
        reframe,
        cropTracks,
        keywords: clip.details.keywords,
        broll,
        textOverlays,
      }),
    [
      clip,
      tokens,
      removed,
      corrections,
      caption,
      reframe,
      cropTracks,
      broll,
      textOverlays,
    ],
  );

  // Teks yang masih tampil di klip (tidak seluruhnya di bagian terpotong).
  const shownTextIds = useMemo(
    () => new Set(composition.textOverlays.map((s) => s.overlay.id)),
    [composition],
  );

  const player = useRef<ClipPreviewHandle>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Posisi pratinjau terakhir (tanpa render ulang tiap frame), untuk B-roll manual.
  const sourceMsRef = useRef(clip.startMs);
  const [playhead] = useState(() => createPlayhead(clip.startMs));
  const currentSourceMs = useCallback(() => sourceMsRef.current, []);
  const onSourceTime = useCallback(
    (sourceMs: number) => {
      sourceMsRef.current = sourceMs;
      playhead.set(sourceMs);
      const index = tokenIndexAt(tokens, sourceMs);
      const token = tokens[index];
      setActiveIndex(token && sourceMs < token.endMs ? index : -1);
    },
    [tokens, playhead],
  );
  const seek = useCallback(
    (sourceMs: number) => player.current?.seekToSource(sourceMs),
    [],
  );

  const save = useCallback(
    async (overrideVersion?: number | null) => {
      const doc = docOf(store.getState());
      setSaveState({ kind: "saving" });
      try {
        const result = await saveEditingScript(clip.id, {
          baseVersion:
            overrideVersion === undefined ? baseVersion : overrideVersion,
          transcriptFingerprint: data.transcriptFingerprint,
          script: {
            removed: doc.removed.map((r) => ({
              ...r,
              tokenIds: [...r.tokenIds],
            })),
            corrections: { ...doc.corrections },
            reframe: doc.reframe,
            caption: doc.caption,
            broll: [...doc.broll],
            textOverlays: [...doc.textOverlays],
          },
        });
        if (result.status === "saved") {
          setBaseVersion(result.editingScript.version);
          setSavedKey(docKey(doc));
          setSaveState({ kind: "idle" });
          if (saveToast.current) dismiss(saveToast.current);
          saveToast.current = null;
        } else if (result.status === "conflict") {
          const current = result.current?.script;
          setSaveState({
            kind: "conflict",
            message: result.message,
            currentVersion: result.current?.version ?? null,
            current: current ? docOf(current) : null,
            currentUpdatedAt: result.current?.updatedAt ?? null,
          });
        } else {
          setSaveState({ kind: "stale", message: result.message });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSaveState({ kind: "error", message });
        saveToast.current = toast({
          key: "save",
          variant: "error",
          title: "Gagal menyimpan.",
          description: `${message} Editanmu aman sebagai draft lokal.`,
          actions: [
            { label: "Coba simpan", onClick: () => retrySave.current() },
            {
              label: "Salin detail error",
              onClick: () => void navigator.clipboard?.writeText(message),
            },
          ],
        });
      }
    },
    [store, baseVersion, clip.id, data, toast, dismiss],
  );
  useEffect(() => {
    retrySave.current = () => void save();
  }, [save]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isShortcutsHelpKey(event)) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        // Tidak menyimpan di balik dialog (mis. keputusan konflik sedang terbuka).
        if (isInOverlay(event.target)) return;
        // Sama seperti tombol Simpan: hanya bila ada perubahan.
        if (dirty && saveState.kind !== "saving") void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, dirty, saveState.kind]);

  const loadCurrent = (state: Extract<SaveState, { kind: "conflict" }>) => {
    const doc = state.current ?? EMPTY_DOC;
    store.getState().replaceDoc(doc);
    setBaseVersion(state.currentVersion);
    setSavedKey(docKey(doc));
    setSaveState({ kind: "idle" });
  };

  const originalMs = clip.endMs - clip.startMs;
  const exportSize = compositionSize(reframe.aspectRatio);
  const previewMeta = [
    reframe.aspectRatio,
    reframe.layout === "fill" ? "Isi" : "Utuh",
    ...(reframe.layout === "fill" && reframe.tracker ? ["Ikuti wajah"] : []),
  ].join(" · ");
  return (
    <EditorStoreContext.Provider value={store}>
      {data.stale && !staleAcknowledged ? (
        <StaleTranscriptDialog
          removedCount={serverDoc(data).removed.length}
          correctionCount={Object.keys(serverDoc(data).corrections).length}
          onAcknowledge={() => setStaleAcknowledged(true)}
        />
      ) : (
        draftOffer && (
          <DraftDialog
            draft={draftOffer}
            onContinue={() => continueDraft(draftOffer)}
            onDiscard={discardDraft}
          />
        )
      )}
      {saveState.kind === "conflict" && (
        <ConflictDialog
          updatedAt={saveState.currentUpdatedAt}
          onLoadLatest={() => loadCurrent(saveState)}
          onOverwrite={() => void save(saveState.currentVersion)}
        />
      )}
      {saveState.kind === "stale" && (
        <StaleSaveDialog
          message={saveState.message}
          onReload={() => window.location.reload()}
          onClose={() => setSaveState({ kind: "idle" })}
        />
      )}
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <EditorHeader
        back={back}
        title={clip.title}
        score={clip.score}
        originalMs={originalMs}
        editedMs={timeline.durationMs}
        sourceName={sourceName}
        history={<EditorToolbar />}
        onShowShortcuts={() => setShortcutsOpen(true)}
        actions={
          <>
            <SaveControls
              status={saveStatusOf({
                saving: saveState.kind === "saving",
                failed: saveState.kind === "error",
                dirty,
                everSaved: baseVersion !== null,
              })}
              onSave={() => void save()}
            />
            <div className="flex justify-end lg:w-56">
              {/* Versi tersimpan berubah → hasil render sebelumnya usang; mulai dari Export lagi. */}
              <ExportControl
                key={baseVersion ?? "baru"}
                clipId={clip.id}
                disabledReason={
                  !videoSrc
                    ? "Video sumber masih diunduh/disiapkan; export bisa setelah selesai."
                    : dirty
                      ? "Simpan dulu: export memakai editan yang sudah disimpan."
                      : null
                }
                summary={`${formatDuration(timeline.durationMs)} · ${exportSize.width}×${exportSize.height}`}
              />
            </div>
          </>
        }
      />

      {/* Tiga kolom di lg+: transkrip | pratinjau | panel alat; menumpuk (pratinjau dulu) di bawahnya. */}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_16rem_23.5rem] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_22rem_28.5rem]">
        <section
          aria-label="Transkrip"
          className="order-3 flex min-h-0 flex-col border-t lg:order-1 lg:border-t-0 lg:border-r"
        >
          {tokens.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">
              Tidak ada transkrip di rentang klip ini.
            </p>
          ) : (
            <>
              <TranscriptToolbar
                tokens={tokens}
                hideRemoved={hideRemoved}
                onHideRemovedChange={setHideRemoved}
              />
              <TranscriptEditor
                tokens={tokens}
                activeIndex={activeIndex}
                hideRemoved={hideRemoved}
                onSeek={seek}
                className="rounded-none border-0 px-4 py-3 focus-visible:ring-1 focus-visible:ring-inset lg:max-h-none lg:min-h-0 lg:flex-1"
              />
              <TranscriptLegend />
            </>
          )}
        </section>
        <section
          aria-label="Pratinjau"
          className="bg-secondary order-1 min-h-0 space-y-3 p-4 lg:order-2 lg:overflow-y-auto lg:border-r"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">Pratinjau</h2>
            <p className="label-mono text-muted-foreground truncate">
              {previewMeta}
            </p>
          </div>
          {videoSrc ? (
            <ClipPreview
              ref={player}
              src={videoSrc}
              composition={composition}
              durationMs={timeline.durationMs}
              onSourceTime={onSourceTime}
              overlay={({ frame, frameRef }) => (
                <TextOverlayEditor
                  sequences={composition.textOverlays}
                  frame={frame}
                  frameRef={frameRef}
                />
              )}
            />
          ) : (
            <div
              className="border-border flex flex-col items-center justify-center gap-2 border border-dashed p-6 text-center"
              style={{ aspectRatio: reframe.aspectRatio.replace(":", " / ") }}
            >
              <SquarePlay
                className="text-muted-foreground size-6"
                aria-hidden
              />
              <p className="text-sm">Video pratinjau belum tersedia.</p>
              <p className="text-muted-foreground text-xs">
                Transkrip tetap bisa diedit. Pratinjau tersedia setelah video
                selesai diproses.
              </p>
            </div>
          )}
        </section>
        <section
          aria-label="Panel editor"
          className="order-2 min-h-0 min-w-0 lg:order-3 lg:overflow-hidden"
        >
          {/* Rail lebih dulu di DOM (Tab: pilih panel, lalu isinya); tampil di kanan pada lg+. */}
          <Tabs
            defaultValue="cleanup"
            orientation="vertical"
            className="h-full lg:flex-row-reverse"
          >
            <RailTabsList aria-label="Panel editor">
              {PANELS.map(({ id, label, icon: Icon }) => (
                <RailTabsTrigger key={id} value={id}>
                  <Icon aria-hidden />
                  {label}
                </RailTabsTrigger>
              ))}
            </RailTabsList>
            {/* Panel tersembunyi tetap terpasang agar state-nya (mis. slider jeda) tidak hilang. */}
            <div className="min-h-0 min-w-0 flex-1 lg:overflow-y-auto">
              <TabsContent value="cleanup" forceMount>
                <PanelHeading id="cleanup" />
                <div className="p-4">
                  {tokens.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Tidak ada transkrip di rentang klip ini.
                    </p>
                  ) : (
                    <SpeechCleanupPanel
                      tokens={tokens}
                      clip={clip}
                      onSeek={seek}
                    />
                  )}
                </div>
              </TabsContent>
              <TabsContent value="caption" forceMount>
                <PanelHeading id="caption" />
                <div className="p-4">
                  <CaptionPanel />
                </div>
              </TabsContent>
              <TabsContent value="reframe" forceMount>
                <PanelHeading id="reframe" />
                <div className="p-4">
                  <ReframePanel
                    state={reframeState.data}
                    onAnalyze={() => analyze.mutate()}
                    analyzing={analyze.isPending}
                    analyzeError={analyze.error?.message ?? null}
                  />
                </div>
              </TabsContent>
              <TabsContent value="broll" forceMount>
                <PanelHeading id="broll" />
                <div className="p-4">
                  <BrollPanel
                    clipId={clip.id}
                    clipEndMs={clip.endMs}
                    timeline={timeline}
                    currentSourceMs={currentSourceMs}
                    onSeek={seek}
                  />
                </div>
              </TabsContent>
              <TabsContent value="text" forceMount>
                <PanelHeading id="text" />
                <div className="p-4">
                  <TextPanel
                    clip={clip}
                    timeline={timeline}
                    shownIds={shownTextIds}
                    currentSourceMs={currentSourceMs}
                    onSeek={seek}
                  />
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </section>
      </div>
      <ClipMap
        tokens={tokens}
        timeline={timeline}
        range={clip}
        broll={broll}
        sourceDurationMs={sourceDurationMs}
        playhead={playhead}
        onSeek={seek}
      />
    </EditorStoreContext.Provider>
  );
}
