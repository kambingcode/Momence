"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CLIP_FOCUS_MAX_LENGTH } from "@/shared/schemas";

/** Contoh sekali-klik; mengisi (mengganti) kolom fokus. */
export const CLIP_FOCUS_EXAMPLES = [
  "Momen lucu dan reaksi",
  "Tips praktis",
  "Cerita pribadi",
  "Debat dan opini kuat",
] as const;

/**
 * Kolom "Fokus klip": arahan opsional untuk pencarian klip oleh Gemini. Dipakai di panel
 * impor/upload dan dialog "Cari ulang klip".
 */
export function ClipFocusField({
  value,
  onChange,
  disabled,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  const descriptionId = `${id}-hint`;
  const remaining = CLIP_FOCUS_MAX_LENGTH - value.length;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm">
          Fokus klip <span className="text-muted-foreground">(opsional)</span>
        </label>
        <span
          className="label-mono text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {value.length}/{CLIP_FOCUS_MAX_LENGTH}
        </span>
      </div>
      <Textarea
        id={id}
        rows={2}
        value={value}
        maxLength={CLIP_FOCUS_MAX_LENGTH}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Mis. momen lucu, reaksi, dan cerita seru"
        aria-describedby={descriptionId}
        aria-invalid={remaining < 0}
      />
      <p id={descriptionId} className="text-muted-foreground text-xs">
        {hint ??
          "Memberi tahu Gemini momen apa yang dicari. Kosongkan untuk pilihan umum."}
      </p>
      <div
        role="group"
        aria-label="Contoh fokus klip"
        className="flex flex-wrap gap-1.5"
      >
        {CLIP_FOCUS_EXAMPLES.map((example) => (
          <Button
            key={example}
            type="button"
            variant="outline"
            size="xs"
            disabled={disabled}
            aria-pressed={value === example}
            onClick={() => onChange(example)}
          >
            {example}
          </Button>
        ))}
      </div>
    </div>
  );
}
