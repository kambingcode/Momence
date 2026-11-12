"use client";

import { cn } from "cn";
import {
  Check,
  Loader2,
  type LucideIcon,
  RectangleHorizontal,
  ScanFace,
  Smartphone,
  Square,
} from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import type { ClipReframeState } from "@/modules/reframe/application";
import type { AspectRatio, ReframeSettings } from "@/shared/schemas";
import { useEditor } from "./editor-store";

const RATIOS: {
  id: AspectRatio;
  label: string;
  hint: string;
  icon: LucideIcon;
}[] = [
  {
    id: "9:16",
    label: "9:16 Vertikal",
    hint: "Reels, TikTok, Shorts",
    icon: Smartphone,
  },
  { id: "1:1", label: "1:1 Persegi", hint: "Feed", icon: Square },
  {
    id: "16:9",
    label: "16:9 Lanskap",
    hint: "YouTube",
    icon: RectangleHorizontal,
  },
];

const LAYOUTS: {
  id: ReframeSettings["layout"];
  label: string;
  hint: string;
}[] = [
  { id: "fill", label: "Isi", hint: "Video dipotong supaya memenuhi layar." },
  { id: "fit", label: "Utuh", hint: "Video utuh di atas latar blur." },
];

interface ReframePanelProps {
  /** `undefined` = status belum dimuat. */
  state: ClipReframeState | undefined;
  onAnalyze: () => void;
  analyzing: boolean;
  analyzeError: string | null;
}

/**
 * Panel Reframe: rasio video hasil, layout Fill/Fit, dan Tracker (crop mengikuti wajah).
 * Perubahan langsung tampil di pratinjau, ikut undo, dan disimpan di EditingScript saat Simpan.
 */
export function ReframePanel({
  state,
  onAnalyze,
  analyzing,
  analyzeError,
}: ReframePanelProps) {
  const reframe = useEditor((s) => s.reframe);
  const setReframe = useEditor((s) => s.setReframe);
  // Jalur kosong = rasio sama dengan video sumber: frame utuh, tidak ada yang perlu diikuti.
  const fullFrame =
    state?.status === "ready" &&
    state.cropTracks?.[reframe.aspectRatio].length === 0;
  const trackerOff =
    reframe.layout === "fit"
      ? "Layout Utuh tidak memotong video."
      : fullFrame
        ? "Rasio ini sama dengan video sumber; tidak ada yang dipotong."
        : null;

  const layoutHint = LAYOUTS.find((l) => l.id === reframe.layout)?.hint;
  return (
    <section aria-label="Pengaturan reframe" className="space-y-4 text-sm">
      <h3 className="font-medium">Rasio</h3>
      <RadioGroupPrimitive.Root
        aria-label="Rasio"
        value={reframe.aspectRatio}
        onValueChange={(aspectRatio) =>
          setReframe({ aspectRatio: aspectRatio as AspectRatio })
        }
        className="space-y-2"
      >
        {RATIOS.map(({ id, label, hint, icon: Icon }) => (
          <RadioGroupPrimitive.Item
            key={id}
            value={id}
            className="group border-border hover:bg-muted data-[state=checked]:border-foreground focus-visible:ring-ring/30 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-3 data-[state=checked]:border-[1.5px]"
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block">{label}</span>
              <span className="text-muted-foreground block text-xs">
                {hint}
              </span>
            </span>
            <Check
              className="size-4 shrink-0 opacity-0 group-data-[state=checked]:opacity-100"
              aria-hidden
            />
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>

      <section
        aria-label="Tata letak"
        className="border-border space-y-3 rounded-xl border p-4"
      >
        <h3 id="reframe-layout" className="font-medium">
          Tata letak
        </h3>
        <SegmentedControl
          aria-labelledby="reframe-layout"
          value={reframe.layout}
          onValueChange={(layout) =>
            setReframe({ layout: layout as ReframeSettings["layout"] })
          }
        >
          {LAYOUTS.map(({ id, label }) => (
            <SegmentedControlItem key={id} value={id}>
              {label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        <p className="text-muted-foreground text-xs">{layoutHint}</p>
      </section>

      <section
        aria-label="Ikuti wajah"
        className="border-border space-y-3 rounded-xl border p-4"
      >
        <label
          className={cn(
            "flex items-start justify-between gap-3",
            trackerOff && "text-muted-foreground",
          )}
        >
          <span>
            <span className="block">Ikuti wajah</span>
            <span className="text-muted-foreground block text-xs">
              {trackerOff ?? "Crop bergeser mengikuti wajah utama."}
            </span>
          </span>
          <Checkbox
            checked={reframe.tracker}
            disabled={trackerOff !== null}
            onCheckedChange={(checked) =>
              setReframe({ tracker: checked === true })
            }
            className="mt-0.5"
          />
        </label>
        <AnalysisStatus
          state={state}
          onAnalyze={onAnalyze}
          analyzing={analyzing}
          error={analyzeError}
        />
      </section>
    </section>
  );
}

function AnalysisStatus({
  state,
  onAnalyze,
  analyzing,
  error,
}: {
  state: ClipReframeState | undefined;
  onAnalyze: () => void;
  analyzing: boolean;
  error: string | null;
}) {
  if (!state) return null;
  const analyze = (label: string) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onAnalyze}
      disabled={analyzing}
    >
      {analyzing ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <ScanFace aria-hidden />
      )}
      {label}
    </Button>
  );
  let content: ReactNode;
  switch (state.status) {
    case "ready":
      content = (
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Check className="size-3.5" aria-hidden />
          Wajah & adegan sudah dianalisis.
        </span>
      );
      break;
    case "pending": {
      const running = state.job?.status === "running";
      content = (
        <>
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {running
              ? `Menganalisis wajah… ${state.job?.progress ?? 0}%`
              : "Analisis wajah menunggu worker…"}
          </span>
          {running && (
            <Progress
              value={state.job?.progress ?? 0}
              aria-label="Progres analisis wajah"
            />
          )}
          <span className="text-muted-foreground block text-xs">
            Crop di tengah sampai analisis selesai.
          </span>
        </>
      );
      break;
    }
    case "failed":
      content = (
        <>
          <span className="text-destructive block text-xs break-words">
            Analisis wajah gagal: {state.job?.error ?? "tidak diketahui"}
          </span>
          {analyze("Coba lagi")}
        </>
      );
      break;
    case "missing":
      content = (
        <>
          <span className="text-muted-foreground block text-xs">
            Klip ini belum dianalisis; crop memakai bagian tengah video.
          </span>
          {analyze("Analisis wajah")}
        </>
      );
      break;
  }
  return (
    <div className="border-border space-y-2 border-t pt-3" aria-live="polite">
      {content}
      {error && (
        <span role="alert" className="text-destructive block text-xs">
          {error}
        </span>
      )}
    </div>
  );
}
