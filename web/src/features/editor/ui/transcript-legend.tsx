import { cn } from "cn";
import { WORD_STATE_CLASS, type WordState } from "./word-state-styles";

const LEGEND: { state: WordState; label: string }[] = [
  { state: "active", label: "Diucapkan" },
  { state: "selected", label: "Dipilih" },
  { state: "removed", label: "Terpotong" },
  { state: "corrected", label: "Dikoreksi" },
  { state: "filler", label: "Filler" },
];

/** Pita bawah panel transkrip: legenda keadaan kata (gaya sama dengan teks) + petunjuk pintasan. */
export function TranscriptLegend() {
  return (
    <div className="text-muted-foreground flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-3 text-xs">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {LEGEND.map(({ state, label }) => (
          <li key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("rounded-sm px-1", WORD_STATE_CLASS[state])}
            >
              kata
            </span>
            {label}
          </li>
        ))}
      </ul>
      <p className="ml-auto">
        Klik lompat · ⇧+klik pilih · ⌫ potong · Enter edit kata
      </p>
    </div>
  );
}
