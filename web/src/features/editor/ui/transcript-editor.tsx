"use client";

import { cn } from "cn";
import { Pause, Scissors } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPause } from "@/features/transcript/ui/format";
import { DEFAULT_PAUSE_MS } from "@/modules/cleanup/application";
import {
  collapsedAt,
  cutSummary,
  deleteAtCursor,
  dragSelection,
  isDragMove,
  moveCaret,
  removedIdSet,
  selectedRange,
} from "@/modules/editor/application";
import type { TranscriptToken } from "@/shared/schemas/transcript";
import { CorrectionPopover } from "./correction-popover";
import { useEditor } from "./editor-store";
import { useCutSelection } from "./use-cut-selection";
import {
  pickWordState,
  WORD_STATE_CLASS,
  type WordState,
} from "./word-state-styles";

interface TranscriptEditorProps {
  tokens: readonly TranscriptToken[];
  /** Token yang sedang diputar (-1 = tidak ada). */
  activeIndex: number;
  /** Sembunyikan token yang terpotong (diganti penanda ✂ per deret). */
  hideRemoved: boolean;
  onSeek: (sourceMs: number) => void;
  /** Penyesuaian tata letak dari pemakai (mis. mengisi tinggi kolom). */
  className?: string;
}

/**
 * Event dari popover koreksi (portal) tetap merambat ke handler panel lewat pohon React;
 * hanya proses event yang terjadi di DOM panel sendiri — kalau tidak, Backspace saat mengetik
 * koreksi ikut memotong kata, dan klik tombol popover memindah fokus sehingga popover tertutup.
 */
const fromPanel = (event: React.SyntheticEvent<HTMLElement>) =>
  event.currentTarget.contains(event.target as Node);

const tokenIndexOf = (target: EventTarget | null): number | null => {
  const element = (target as HTMLElement | null)?.closest<HTMLElement>(
    "[data-index]",
  );
  return element ? Number(element.dataset.index) : null;
};

/** Klik di separuh kanan token → kursor setelahnya. */
function caretFromPoint(target: EventTarget, index: number, clientX: number) {
  const element = (target as HTMLElement).closest<HTMLElement>("[data-index]");
  if (!element) return index;
  const rect = element.getBoundingClientRect();
  return clientX > rect.left + rect.width / 2 ? index + 1 : index;
}

/**
 * Panel transkrip yang bisa diedit seperti teks: klik = kursor, Shift+panah / seret = seleksi,
 * Backspace/Delete = potong (dicoret, bisa dipulihkan), klik ganda / Enter = koreksi kata.
 * Teks koreksi ditampilkan menggantikan teks asli.
 */
export function TranscriptEditor({
  tokens,
  activeIndex,
  hideRemoved,
  onSeek,
  className,
}: TranscriptEditorProps) {
  const removed = useEditor((s) => s.removed);
  const corrections = useEditor((s) => s.corrections);
  const cursor = useEditor((s) => s.cursor);
  const setCursor = useEditor((s) => s.setCursor);
  const removeTokens = useEditor((s) => s.removeTokens);
  const removedIds = useMemo(() => removedIdSet(removed), [removed]);
  const drag = useRef<{
    origin: number;
    moved: boolean;
    start: { x: number; y: number };
  } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<number | null>(null);
  // Toolbar potong mengambang menunggu seretan selesai agar tidak berkedip.
  const [dragging, setDragging] = useState(false);
  const finding = useEditor((s) => s.finding);
  const thresholdMs = useEditor((s) => s.pauseThresholdMs) ?? DEFAULT_PAUSE_MS;
  const { cuttable, cut } = useCutSelection(tokens);
  const count = tokens.length;
  const isRemoved = (i: number) => removedIds.has(tokens[i]!.id);
  const isHidden = (i: number) => hideRemoved && isRemoved(i);
  const selection = selectedRange(cursor);
  // Temuan dinavigasi hanya disorot selama seleksi persis sama dengan rentangnya.
  const activeFinding =
    finding &&
    selection &&
    selection[0] === finding.range[0] &&
    selection[1] === finding.range[1]
      ? finding
      : null;
  /** Hanya kata/filler yang belum terpotong yang bisa dikoreksi. */
  const editable = (i: number) =>
    tokens[i] !== undefined && tokens[i].type !== "pause" && !isRemoved(i);
  const closeEditor = () => {
    setEditing(null);
    panel.current?.focus();
  };

  // Kursor yang dipindah dari luar panel (navigator Speech cleanup) atau dengan panah tetap
  // terlihat; hanya panel yang digulir, bukan halaman.
  useEffect(() => {
    const box = panel.current;
    const range = selectedRange(cursor);
    const index = range ? range[0] : Math.min(cursor.caret, count - 1);
    const element = box?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!box || !element) return;
    // Gulir secukupnya (seperti `block: "nearest"`), dengan sedikit ruang di tepi.
    const margin = 16;
    const top = element.offsetTop - margin;
    const bottom = element.offsetTop + element.offsetHeight + margin;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight)
      box.scrollTop = bottom - box.clientHeight;
  }, [cursor, count]);

  useEffect(() => {
    const stop = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!fromPanel(event)) return;
    const extend = event.shiftKey;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
        setCursor(
          moveCaret(
            cursor,
            event.key === "ArrowLeft" ? -1 : 1,
            extend,
            count,
            isHidden,
          ),
        );
        break;
      case "Home":
      case "End": {
        const caret = event.key === "Home" ? 0 : count;
        setCursor(
          extend
            ? { caret, anchor: cursor.anchor ?? cursor.caret }
            : collapsedAt(caret),
        );
        break;
      }
      case "Backspace":
      case "Delete": {
        const result = deleteAtCursor(
          cursor,
          event.key === "Backspace" ? -1 : 1,
          count,
          isRemoved,
        );
        if (result.indices.length > 0)
          removeTokens(result.indices.map((i) => tokens[i]!.id));
        setCursor(result.cursor);
        break;
      }
      case "Escape":
        setCursor(collapsedAt(cursor.caret));
        break;
      case "Enter": {
        // Koreksi kata di kanan kursor (atau awal seleksi).
        const index = selection ? selection[0] : cursor.caret;
        if (editable(index)) setEditing(index);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !fromPanel(event)) return;
    // Tanpa preventScroll, panel yang lebih tinggi dari layar membuat halaman bergulir saat
    // diklik; token lain lalu berada di bawah pointer dan terbaca sebagai seret.
    event.currentTarget.focus({ preventScroll: true });
    const index = tokenIndexOf(event.target);
    if (index === null) return;
    // Cegah seleksi teks bawaan browser; seleksi diatur sendiri.
    event.preventDefault();
    const caret = caretFromPoint(event.target, index, event.clientX);
    if (event.shiftKey) {
      setCursor({ caret, anchor: cursor.anchor ?? cursor.caret });
      return;
    }
    drag.current = {
      origin: index,
      moved: false,
      start: { x: event.clientX, y: event.clientY },
    };
    setCursor(collapsedAt(caret));
    onSeek(tokens[index]!.startMs);
  };

  const onPointerOver = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!fromPanel(event)) return;
    const current = drag.current;
    const index = tokenIndexOf(event.target);
    if (!current || index === null) return;
    if (index === current.origin && !current.moved) return;
    // Token di bawah pointer bisa berganti tanpa gerakan (layout berubah): bukan seret.
    if (
      !current.moved &&
      !isDragMove(current.start, { x: event.clientX, y: event.clientY })
    )
      return;
    current.moved = true;
    setDragging(true);
    setCursor(dragSelection(current.origin, index));
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!fromPanel(event)) return;
    const index = tokenIndexOf(event.target);
    if (index !== null && editable(index)) setEditing(index);
  };

  const caretMark = (
    <span
      aria-hidden
      className="bg-primary -mx-px inline-block h-5 w-0.5 translate-y-1 animate-pulse rounded-full"
    />
  );

  /** Keadaan gambar untuk token ke-`i` (token tersembunyi tidak digambar sehingga tak dihitung). */
  const stateAt = (i: number): WordState | null => {
    const token = tokens[i]!;
    return pickWordState({
      finding:
        activeFinding !== null &&
        i >= activeFinding.range[0] &&
        i < activeFinding.range[1],
      active: i === activeIndex && !isRemoved(i),
      selected: selection !== null && i >= selection[0] && i < selection[1],
      removed: isRemoved(i),
      corrected: token.id in corrections,
      filler: token.type === "filler",
    });
  };

  /** Kata pertama seleksi yang terlihat: jangkar toolbar potong mengambang. */
  const cutBarIndex = (() => {
    if (
      !selection ||
      dragging ||
      editing !== null ||
      activeFinding ||
      cuttable.length === 0
    )
      return null;
    for (let i = selection[0]; i < selection[1]; i += 1)
      if (!isHidden(i) && !isRemoved(i)) return i;
    return null;
  })();
  const cutSummaryText = (() => {
    const { words, durationMs } = cutSummary(cuttable);
    return `${words} kata · ${formatPause(durationMs)}`;
  })();

  /** Chip jeda: putus-putus = di bawah ambang Speech cleanup, tegas = temuan. */
  const pauseClass = (i: number, state: WordState | null) => {
    const duration = tokens[i]!.endMs - tokens[i]!.startMs;
    if (state === "finding") return "border-2 border-primary bg-background";
    if (state === "removed")
      return "border-dashed border-border text-muted-foreground line-through";
    if (state === "active" || state === "selected")
      return cn("border-transparent", WORD_STATE_CLASS[state]);
    return duration >= thresholdMs
      ? "border-input"
      : "border-dashed border-border text-muted-foreground";
  };

  return (
    <div
      role="textbox"
      aria-multiline
      aria-label="Transkrip klip. Klik untuk menaruh kursor, Shift+panah atau seret untuk memilih, Backspace/Delete untuk memotong."
      ref={panel}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      className={cn(
        "focus-visible:ring-ring/50 relative max-h-[calc(100dvh-16rem)] min-h-40 cursor-text overflow-y-auto rounded-lg border p-4 text-[17.5px] leading-9 outline-none select-none focus-visible:ring-2",
        className,
      )}
    >
      <div className="max-w-[640px]">
        {tokens.map((token, i) => {
          const hidden = isHidden(i);
          const caretHere = !selection && cursor.caret === i;
          if (hidden) {
            // Satu chip per deret token tersembunyi; klik = pilih deret itu (siap dipulihkan).
            const runStart = i === 0 || !isHidden(i - 1);
            let runEnd = i;
            while (runEnd < count && isHidden(runEnd)) runEnd += 1;
            const words = tokens
              .slice(i, runEnd)
              .filter((t) => t.type !== "pause").length;
            return (
              <Fragment key={token.id}>
                {caretHere && caretMark}
                {runStart && (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`${words} kata terpotong disembunyikan. Pilih untuk memulihkan.`}
                    onClick={() => {
                      setCursor({ anchor: i, caret: runEnd });
                      panel.current?.focus({ preventScroll: true });
                    }}
                    className="border-input text-muted-foreground hover:bg-secondary mx-1 inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 align-middle text-xs"
                  >
                    <Scissors className="size-3" aria-hidden />
                    {words} kata
                  </button>
                )}
              </Fragment>
            );
          }
          const cutToken = isRemoved(i);
          const state = stateAt(i);
          const isPause = token.type === "pause";
          const text = corrections[token.id] ?? token.text;
          const label =
            state === "finding" &&
            activeFinding?.label &&
            i === activeFinding.range[0];
          const word = (
            <span
              data-index={i}
              data-removed={cutToken || undefined}
              title={
                cutToken
                  ? "Terpotong — taruh kursor di sini lalu Pulihkan"
                  : undefined
              }
              className={cn(
                "rounded-sm px-0.5 py-1",
                label && "relative",
                isPause
                  ? cn(
                      "mx-0.5 inline-flex items-center gap-1 rounded-xs border px-1.5 font-mono text-xs",
                      pauseClass(i, state),
                    )
                  : state && WORD_STATE_CLASS[state],
              )}
            >
              {label && (
                <span
                  aria-hidden
                  className="border-primary bg-background pointer-events-none absolute bottom-full left-0 z-10 translate-y-1/2 rounded-xs border px-1 font-mono text-[10px] leading-4 whitespace-nowrap select-none"
                >
                  {activeFinding.label} · {activeFinding.position}
                </span>
              )}
              {isPause ? (
                <>
                  <Pause className="size-2.5 fill-current" aria-hidden />
                  {formatPause(token.endMs - token.startMs)}
                </>
              ) : (
                text
              )}
            </span>
          );
          // Seleksi/temuan menyambung: spasi di antara dua kata berstatus sama ikut diblok.
          const nextState =
            i + 1 < count && !isHidden(i + 1) ? stateAt(i + 1) : null;
          const joined =
            (state === "selected" || state === "finding") &&
            state === nextState;
          const gap = joined ? (
            <span className={cn("py-1", WORD_STATE_CLASS[state])}> </span>
          ) : (
            " "
          );
          let node: React.ReactNode = word;
          if (editing === i) {
            node = (
              <CorrectionPopover
                tokens={tokens}
                index={i}
                onClose={closeEditor}
              >
                {word}
              </CorrectionPopover>
            );
          } else if (cutBarIndex === i) {
            node = (
              <Popover open modal={false}>
                <PopoverAnchor asChild>{word}</PopoverAnchor>
                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={6}
                  aria-label="Potong seleksi"
                  className="flex w-auto items-center gap-2 p-1.5"
                  // Popover ini mengikuti seleksi: jangan mencuri fokus dari teks atau menutup sendiri.
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                  onInteractOutside={(event) => event.preventDefault()}
                  onEscapeKeyDown={(event) => event.preventDefault()}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      cut();
                      panel.current?.focus({ preventScroll: true });
                    }}
                  >
                    Potong <Kbd>⌫</Kbd>
                  </Button>
                  <span className="label-mono text-muted-foreground pr-1 tabular-nums">
                    {cutSummaryText}
                  </span>
                </PopoverContent>
              </Popover>
            );
          } else if (token.id in corrections && !cutToken) {
            node = (
              <Tooltip>
                <TooltipTrigger asChild>{word}</TooltipTrigger>
                <TooltipContent>
                  Asli: <span className="font-mono">{token.text}</span>
                </TooltipContent>
              </Tooltip>
            );
          }
          return (
            <Fragment key={token.id}>
              {caretHere && caretMark}
              {node}
              {gap}
            </Fragment>
          );
        })}
        {!selection && cursor.caret >= count && caretMark}
      </div>
    </div>
  );
}
