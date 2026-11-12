"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "cn";
import { dragTextPosition } from "@/modules/editor/application";
import {
  type ClipRenderProps,
  visibleTextIds,
} from "@/modules/render/application";
import { TEXT_OVERLAY_MAX_LENGTH } from "@/shared/schemas";
import { useEditor } from "./editor-store";

/** Seretan lebih pendek dari ini (px) dianggap klik (memilih saja). */
const DRAG_THRESHOLD_PX = 3;

interface Size {
  width: number;
  height: number;
}

interface DragState {
  id: string;
  gesture: string;
  pointerX: number;
  pointerY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

/**
 * Ukuran kotak tiap teks yang tampil, diukur dari elemen `data-text-overlay` di dalam Player
 * (ukuran layar, sudah termasuk skala pratinjau). Diukur ulang saat isi/gaya, frame, ukuran
 * pratinjau, atau font yang selesai dimuat berubah.
 */
function useTextBoxSizes(
  container: RefObject<HTMLElement | null>,
  ids: readonly string[],
  deps: readonly unknown[],
): Record<string, Size> {
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const remeasure = () => setTick((t) => t + 1);
    const observer = new ResizeObserver(remeasure);
    observer.observe(element);
    document.fonts?.addEventListener("loadingdone", remeasure);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", remeasure);
    };
  }, [container]);
  const key = ids.join("|");
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const next: Record<string, Size> = {};
    for (const id of key ? key.split("|") : []) {
      const box = element.querySelector(
        `[data-text-overlay="${CSS.escape(id)}"]`,
      );
      if (!box) continue;
      const rect = box.getBoundingClientRect();
      next[id] = { width: rect.width, height: rect.height };
    }
    setSizes((current) => {
      const same =
        Object.keys(current).length === Object.keys(next).length &&
        Object.entries(next).every(
          ([id, size]) =>
            current[id]?.width === size.width &&
            current[id]?.height === size.height,
        );
      return same ? current : next;
    });
    // `deps` dari pemanggil: perubahan isi/gaya teks & frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, key, tick, ...deps]);
  return sizes;
}

interface TextOverlayEditorProps {
  /** Teks di komposisi pratinjau (frame). */
  sequences: ClipRenderProps["textOverlays"];
  /** Frame pratinjau saat ini. */
  frame: number;
  /** Bingkai pratinjau (Player) tempat teks digambar & diukur. */
  frameRef: RefObject<HTMLElement | null>;
}

/**
 * Lapisan editor di atas pratinjau (bukan bagian komposisi, jadi tidak ikut ter-render): kotak
 * pilih untuk tiap teks yang sedang tampil. Klik = pilih, seret = pindah (menempel ke garis
 * tengah), klik ganda / Enter = ubah isi, panah = geser 1% (⇧ 5%), Delete = hapus, Esc = lepas.
 */
export function TextOverlayEditor({
  sequences,
  frame,
  frameRef,
}: TextOverlayEditorProps) {
  const textOverlays = useEditor((s) => s.textOverlays);
  const selectedId = useEditor((s) => s.selectedTextId);
  const selectText = useEditor((s) => s.selectText);
  const moveText = useEditor((s) => s.moveText);
  const updateText = useEditor((s) => s.updateText);
  const removeText = useEditor((s) => s.removeText);

  const visible = visibleTextIds(sequences, frame);
  const sizes = useTextBoxSizes(frameRef, visible, [textOverlays, frame]);
  const drag = useRef<DragState | null>(null);
  const [snap, setSnap] = useState({ x: false, y: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const boxes = useRef(new Map<string, HTMLDivElement>());

  // Teks yang sedang diubah isinya hilang (dihapus / di-undo / keluar rentang) → tutup kolom.
  const editing = textOverlays.find(
    (t) => t.id === editingId && visible.includes(t.id),
  );
  useEffect(() => {
    if (editingId && !editing) setEditingId(null);
  }, [editingId, editing]);

  // Klik di area video (di luar kotak teks) melepas pilihan; Player tetap memutar/menjeda.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const deselect = () => selectText(null);
    element.addEventListener("pointerdown", deselect);
    return () => element.removeEventListener("pointerdown", deselect);
  }, [frameRef, selectText]);

  const frameSize = (): Size => {
    const rect = frameRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  };

  const onPointerDown = (id: string, event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const item = textOverlays.find((t) => t.id === id);
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    selectText(id);
    drag.current = {
      id,
      // Unik per seretan (juga setelah komponen dipasang ulang) agar tidak tergabung ke undo lama.
      gesture: crypto.randomUUID(),
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: item.x,
      startY: item.y,
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.pointerX;
    const dy = event.clientY - current.pointerY;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    current.moved = true;
    const next = dragTextPosition(
      { x: current.startX, y: current.startY },
      { dx, dy },
      frameSize(),
    );
    setSnap({ x: next.snapX, y: next.snapY });
    moveText(current.id, next, current.gesture);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setSnap({ x: false, y: false });
  };

  const onKeyDown = (id: string, event: KeyboardEvent<HTMLDivElement>) => {
    const item = textOverlays.find((t) => t.id === id);
    if (!item) return;
    const step = event.shiftKey ? 5 : 1;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const arrow = arrows[event.key];
    if (arrow) {
      moveText(id, { x: item.x + arrow[0], y: item.y + arrow[1] });
    } else if (event.key === "Delete" || event.key === "Backspace") {
      removeText(id);
    } else if (event.key === "Enter") {
      setEditingId(id);
    } else if (event.key === "Escape") {
      selectText(null);
      event.currentTarget.blur();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      {snap.x && (
        <div
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/80 shadow-[0_0_0_1px_rgba(19,19,21,0.4)]"
        />
      )}
      {snap.y && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/80 shadow-[0_0_0_1px_rgba(19,19,21,0.4)]"
        />
      )}
      {textOverlays
        .filter((item) => visible.includes(item.id))
        .map((item) => {
          const size = sizes[item.id];
          const selected = item.id === selectedId;
          return (
            <div
              key={item.id}
              ref={(element) => {
                if (element) boxes.current.set(item.id, element);
                else boxes.current.delete(item.id);
              }}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`Teks “${item.text}”. Seret atau tekan panah untuk memindah, Enter untuk mengubah isi, Delete untuk menghapus.`}
              data-text-box={item.id}
              className={cn(
                "pointer-events-auto absolute cursor-move touch-none outline-none select-none",
                // Garis ganda (putih + charcoal) agar terlihat di video gelap maupun terang.
                selected
                  ? "outline-1 outline-offset-2 outline-white outline-dashed [box-shadow:0_0_0_1px_rgba(19,19,21,0.6)]"
                  : "hover:outline-1 hover:outline-offset-2 hover:outline-white/70 hover:outline-dashed focus-visible:outline-1 focus-visible:outline-white focus-visible:outline-dashed",
              )}
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: size?.width ?? 0,
                height: size?.height ?? 0,
                transform: "translate(-50%, -50%)",
              }}
              onPointerDown={(event) => onPointerDown(item.id, event)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onDoubleClick={() => setEditingId(item.id)}
              onKeyDown={(event) => onKeyDown(item.id, event)}
            />
          );
        })}
      {editing && (
        <TextContentField
          key={editing.id}
          text={editing.text}
          x={editing.x}
          y={editing.y}
          onChange={(text) => updateText(editing.id, { text }, "text")}
          onDone={() => {
            setEditingId(null);
            boxes.current.get(editing.id)?.focus();
          }}
        />
      )}
    </div>
  );
}

/** Kolom isi teks di atas kotaknya (klik ganda / Enter); Enter atau Esc = selesai. */
function TextContentField({
  text,
  x,
  y,
  onChange,
  onDone,
}: {
  text: string;
  x: number;
  y: number;
  onChange: (text: string) => void;
  onDone: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  return (
    <textarea
      ref={field}
      aria-label="Isi teks"
      value={text}
      maxLength={TEXT_OVERLAY_MAX_LENGTH}
      rows={2}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        // Shift+Enter = baris baru (dipertahankan di video).
        if (
          (event.key === "Enter" && !event.shiftKey) ||
          event.key === "Escape"
        ) {
          event.preventDefault();
          onDone();
        }
        event.stopPropagation();
      }}
      onBlur={onDone}
      className="border-input bg-background pointer-events-auto absolute w-[80%] max-w-64 resize-none rounded-md border px-2 py-1 text-sm shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      style={{
        left: `${Math.min(Math.max(x, 20), 80)}%`,
        top: `${Math.min(y, 85)}%`,
        transform: "translate(-50%, 0.75rem)",
      }}
    />
  );
}
