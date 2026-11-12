"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditorHistory } from "./editor-store";
import { isInOverlay, isTextInput } from "./keyboard";

/** Urungkan / Ulangi + pintasan keyboard (Pulihkan ada di kepala panel transkrip). */
export function EditorToolbar() {
  const undo = useEditorHistory((h) => h.undo);
  const redo = useEditorHistory((h) => h.redo);
  const canUndo = useEditorHistory((h) => h.pastStates.length > 0);
  const canRedo = useEditorHistory((h) => h.futureStates.length > 0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        isTextInput(event.target) ||
        isInOverlay(event.target)
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) undo();
      else if ((key === "z" && event.shiftKey) || key === "y") redo();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div
      className="flex items-center gap-1"
      role="toolbar"
      aria-label="Riwayat editan"
    >
      <HistoryButton
        label="Urungkan"
        shortcut="⌘Z"
        disabled={!canUndo}
        onClick={() => undo()}
      >
        <Undo2 aria-hidden />
      </HistoryButton>
      <HistoryButton
        label="Ulangi"
        shortcut="⌘⇧Z"
        disabled={!canRedo}
        onClick={() => redo()}
      >
        <Redo2 aria-hidden />
      </HistoryButton>
    </div>
  );
}

/** Tombol ikon dengan tooltip nama + pintasan; tombol nonaktif dibungkus agar tooltip tetap muncul. */
function HistoryButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
