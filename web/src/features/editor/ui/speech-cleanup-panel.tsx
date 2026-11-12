"use client";

import { useQuery } from "@tanstack/react-query";
import { AudioWaveform, ChevronLeft, ChevronRight, Pause } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { fetchSettings, settingsQueryKey } from "@/features/settings/api";
import { formatPause } from "@/features/transcript/ui/format";
import {
  type CleanupKind,
  type CleanupMatch,
  DEFAULT_FILLER_CONFIG,
  DEFAULT_PAUSE_MS,
  type FillerConfig,
  findCleanup,
  indexOfMatch,
  PAUSE_SLIDER_MS,
  removalsFor,
  stepMatch,
} from "@/modules/cleanup/application";
import {
  buildTimeline,
  removedIdSet,
  type TimeRange,
} from "@/modules/editor/application";
import type { TranscriptToken } from "@/shared/schemas/transcript";
import { useEditor } from "./editor-store";

type FillerKind = Exclude<CleanupKind, "pause">;

/** Label jenis temuan di atas kata yang dinavigasi (jeda tanpa label: bingkai saja). */
const KIND_LABEL: Record<CleanupKind, string | null> = {
  pause: null,
  filler: "Kata pengisi",
  phrase: "Frasa pengisi",
  repeated: "Kata berulang",
};

const FILLER_KINDS: {
  kind: FillerKind;
  label: string;
  hint: (config: FillerConfig) => string;
}[] = [
  {
    kind: "filler",
    label: "Kata pengisi",
    hint: (config) => config.words.join(", ") || "daftar kosong (Pengaturan)",
  },
  {
    kind: "phrase",
    label: "Frasa pengisi",
    hint: (config) => config.phrases.join(", ") || "daftar kosong (Pengaturan)",
  },
  {
    kind: "repeated",
    label: "Kata berulang",
    hint: () => "“saya saya” → kata terakhir dipertahankan",
  },
];

interface SpeechCleanupPanelProps {
  tokens: readonly TranscriptToken[];
  clip: TimeRange;
  onSeek: (sourceMs: number) => void;
}

/**
 * Panel Speech cleanup: jumlah jeda (≥ ambang slider) & filler per kategori, navigator per jenis
 * (memilih temuan di transkrip & melompatkan video), dan "Hapus semua" untuk jenis yang
 * dicentang — satu langkah undo, satu grup potongan per temuan.
 */
export function SpeechCleanupPanel({
  tokens,
  clip,
  onSeek,
}: SpeechCleanupPanelProps) {
  const removed = useEditor((s) => s.removed);
  const setCursor = useEditor((s) => s.setCursor);
  const setFinding = useEditor((s) => s.setFinding);
  const setPauseThresholdMs = useEditor((s) => s.setPauseThresholdMs);
  const removeGroups = useEditor((s) => s.removeGroups);
  // Daftar filler & ambang awal dari halaman Pengaturan; bawaan selama belum termuat/gagal.
  const settings = useQuery({
    queryKey: settingsQueryKey,
    queryFn: fetchSettings,
  });
  const preferences = settings.data?.preferences;
  const fillerConfig = useMemo<FillerConfig>(
    () =>
      preferences
        ? { words: preferences.fillerWords, phrases: preferences.fillerPhrases }
        : DEFAULT_FILLER_CONFIG,
    [preferences],
  );
  // `null` = belum digeser pengguna → ikut ambang dari Pengaturan.
  const [pauseOverride, setPauseMinMs] = useState<number | null>(null);
  const pauseMinMs =
    pauseOverride ?? preferences?.pauseMinMs ?? DEFAULT_PAUSE_MS;
  // Teks transkrip menggambar chip jeda ≥ ambang sebagai temuan.
  useEffect(() => {
    setPauseThresholdMs(pauseMinMs);
    return () => setPauseThresholdMs(null);
  }, [pauseMinMs, setPauseThresholdMs]);
  const [fillerKinds, setFillerKinds] = useState<ReadonlySet<FillerKind>>(
    () => new Set(FILLER_KINDS.map((k) => k.kind)),
  );
  const [status, setStatus] = useState("");

  const removedIds = useMemo(() => removedIdSet(removed), [removed]);
  const found = useMemo(
    () => findCleanup(tokens, removedIds, pauseMinMs, fillerConfig),
    [tokens, removedIds, pauseMinMs, fillerConfig],
  );
  const { pauses, fillers } = useMemo(
    () => ({
      pauses: found.filter((m) => m.kind === "pause"),
      fillers: found.filter(
        (m) => m.kind !== "pause" && fillerKinds.has(m.kind),
      ),
    }),
    [found, fillerKinds],
  );
  const countOf = (kind: CleanupKind) =>
    found.filter((m) => m.kind === kind).length;
  /** Durasi klip yang berkurang bila `matches` dihapus (selain yang sudah terpotong). */
  const savingOf = (matches: readonly CleanupMatch[]) => {
    const after = new Set([
      ...removedIds,
      ...matches.flatMap((m) => m.tokenIds),
    ]);
    return (
      buildTimeline(tokens, removedIds, clip).durationMs -
      buildTimeline(tokens, after, clip).durationMs
    );
  };

  // Pesan "N temuan dihapus" hilang sendiri agar tidak menyesatkan setelah undo.
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(""), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  const indexOf = useMemo(
    () => new Map(tokens.map((t, i) => [t.id, i])),
    [tokens],
  );
  const show = (match: CleanupMatch, position: string) => {
    const first = indexOf.get(match.tokenIds[0]!);
    const last = indexOf.get(match.tokenIds.at(-1)!);
    if (first === undefined || last === undefined) return;
    // Seleksi tetap dibuat (Backspace/Delete langsung memotong temuan); `finding` hanya
    // mengubah cara teks menggambarnya selama seleksi itu bertahan.
    setCursor({ anchor: first, caret: last + 1 });
    setFinding({
      range: [first, last + 1],
      label: KIND_LABEL[match.kind],
      position,
    });
    onSeek(match.startMs);
  };
  const remove = (matches: readonly CleanupMatch[]) => {
    setFinding(null);
    removeGroups(removalsFor(matches));
    setStatus(
      `${matches.length} temuan dihapus. Urungkan dengan Ctrl/⌘+Z atau Pulihkan.`,
    );
  };
  const toggleKind = (kind: FillerKind, on: boolean) =>
    setFillerKinds((current) => {
      const next = new Set(current);
      if (on) next.add(kind);
      else next.delete(kind);
      return next;
    });

  return (
    <section aria-label="Speech cleanup" className="space-y-4 text-sm">
      <CleanupCard
        icon={<Pause aria-hidden />}
        title="Jeda"
        count={pauses.length}
        countTestId="pause-count"
      >
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">Durasi minimum</span>
            <span className="label-mono tabular-nums">
              ≥ {formatPause(pauseMinMs)}
            </span>
          </div>
          <Slider
            min={PAUSE_SLIDER_MS.min}
            max={PAUSE_SLIDER_MS.max}
            step={PAUSE_SLIDER_MS.step}
            value={[pauseMinMs]}
            onValueChange={([next]) => setPauseMinMs(next ?? pauseMinMs)}
            aria-label="Durasi jeda minimum"
          />
        </div>
        <MatchNavigator
          label="jeda"
          matches={pauses}
          onShow={show}
          onRemove={(match) => remove([match])}
        />
        <RemoveAll
          matches={pauses}
          saving={savingOf(pauses)}
          onRemove={remove}
        />
      </CleanupCard>

      <CleanupCard
        icon={<AudioWaveform aria-hidden />}
        title="Filler"
        count={fillers.length}
      >
        <ul className="space-y-2">
          {FILLER_KINDS.map(({ kind, label, hint }) => (
            <li key={kind}>
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={fillerKinds.has(kind)}
                  onCheckedChange={(checked) =>
                    toggleKind(kind, checked === true)
                  }
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block">{label}</span>
                  <span
                    className="text-muted-foreground block truncate text-xs"
                    title={hint(fillerConfig)}
                  >
                    {hint(fillerConfig)}
                  </span>
                </span>
                <span className="label-mono text-muted-foreground tabular-nums">
                  {countOf(kind)}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <MatchNavigator
          label="filler"
          matches={fillers}
          onShow={show}
          onRemove={(match) => remove([match])}
        />
        <RemoveAll
          matches={fillers}
          saving={savingOf(fillers)}
          onRemove={remove}
        />
      </CleanupCard>

      <p className="text-muted-foreground min-h-5" aria-live="polite">
        {status}
      </p>
    </section>
  );
}

/** Kartu satu jenis temuan: ikon + judul + jumlah ditemukan, lalu kontrolnya. */
function CleanupCard({
  icon,
  title,
  count,
  countTestId,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  countTestId?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="border-border space-y-4 rounded-xl border p-4"
    >
      <header className="flex items-center gap-2">
        <span className="bg-secondary text-foreground flex size-6 items-center justify-center rounded-xs [&_svg]:size-3.5">
          {icon}
        </span>
        <h3 className="flex-1 font-medium">{title}</h3>
        <span
          className="label-mono text-muted-foreground tabular-nums"
          data-testid={countTestId}
        >
          {count} ditemukan
        </span>
      </header>
      {children}
    </section>
  );
}

/** "Hapus semua" untuk satu kartu (satu langkah undo) + penghematan durasinya. */
function RemoveAll({
  matches,
  saving,
  onRemove,
}: {
  matches: readonly CleanupMatch[];
  saving: number;
  onRemove: (matches: readonly CleanupMatch[]) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      {matches.length > 0 && (
        <span className="label-mono text-muted-foreground tabular-nums">
          durasi −{formatPause(saving)}
        </span>
      )}
      <Button
        variant="secondary"
        onClick={() => onRemove(matches)}
        disabled={matches.length === 0}
      >
        Hapus semua ({matches.length})
      </Button>
    </div>
  );
}

/**
 * Sebelumnya / Berikutnya (berputar) + hapus temuan yang sedang ditampilkan. Temuan diingat
 * sebagai temuan, bukan indeks: setelah dihapus, penghitung menjadi "–" dan langkah berikutnya
 * lanjut dari posisi waktunya, sehingga 🗑 tidak pernah menghapus temuan yang tidak terlihat.
 */
function MatchNavigator({
  label,
  matches,
  onShow,
  onRemove,
}: {
  label: string;
  matches: readonly CleanupMatch[];
  onShow: (match: CleanupMatch, position: string) => void;
  onRemove: (match: CleanupMatch) => void;
}) {
  const [shown, setShown] = useState<CleanupMatch | null>(null);
  const count = matches.length;
  const current = shown ? indexOfMatch(matches, shown) : -1;
  const go = (step: -1 | 1) => {
    const nextIndex = stepMatch(matches, shown, step);
    const next = matches[nextIndex];
    if (!next) return;
    setShown(next);
    onShow(next, `${nextIndex + 1} / ${count}`);
  };
  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={`Navigasi ${label}`}
    >
      <div className="border-input flex items-center rounded-lg border">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => go(-1)}
          disabled={count === 0}
          aria-label={`${label} sebelumnya`}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="label-mono min-w-14 text-center tabular-nums">
          {current < 0 ? "–" : current + 1} / {count}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => go(1)}
          disabled={count === 0}
          aria-label={`${label} berikutnya`}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onRemove(matches[current]!)}
        disabled={current < 0}
        title={`Hapus ${label} yang sedang ditampilkan`}
      >
        Hapus ini<span className="sr-only"> {label}</span>
      </Button>
    </div>
  );
}
