"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { correctionsForAll, matchingWords } from "@/modules/editor/application";
import type { TranscriptToken } from "@/shared/schemas/transcript";
import { useEditor } from "./editor-store";

interface CorrectionPopoverProps {
  tokens: readonly TranscriptToken[];
  index: number;
  /** Elemen kata yang dikoreksi (jangkar popover). */
  children: React.ReactNode;
  onClose: () => void;
}

/**
 * Edit teks caption satu kata: Terapkan (kata ini), Terapkan ke semua (N) (kata sama di klip
 * ini); Esc membatalkan. Hanya teks yang berubah; waktu & durasi tetap. Kosong = kembali ke
 * teks asli.
 */
export function CorrectionPopover({
  tokens,
  index,
  children,
  onClose,
}: CorrectionPopoverProps) {
  const token = tokens[index]!;
  const corrections = useEditor((s) => s.corrections);
  const correct = useEditor((s) => s.correct);
  const [text, setText] = useState(corrections[token.id] ?? token.text);
  const matches = matchingWords(tokens, index);
  const originalText = (id: string) => tokens.find((t) => t.id === id)?.text;

  const apply = (all: boolean) => {
    correct(
      all
        ? correctionsForAll(tokens, index, text)
        : { [token.id]: text.trim() || null },
      originalText,
    );
    onClose();
  };

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        aria-label="Koreksi kata"
        className="w-80"
        // Kembalikan fokus ke panel transkrip (bukan ke elemen pemicu bawaan Radix).
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            apply(false);
          }}
        >
          <label className="block space-y-2 text-sm">
            <span className="flex items-baseline justify-between gap-2">
              <span>Edit kata</span>
              <span className="text-muted-foreground text-xs">
                Asli: {token.text}
              </span>
            </span>
            <Input
              autoFocus
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm">
              Terapkan
            </Button>
            {matches.length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => apply(true)}
              >
                Terapkan ke semua ({matches.length})
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Enter terapkan · Esc batal · kosongkan untuk kembali ke teks asli
          </p>
        </form>
      </PopoverContent>
    </Popover>
  );
}
