import type { CaptionPresetId } from "@/modules/captions/application";
import { presetStyle } from "@/modules/captions/application";

const BASE = "flex h-full items-center justify-center gap-1 px-2 leading-none";

/**
 * Cuplikan kecil satu preset di atas bingkai hitam (seperti video): memakai warna & bentuk
 * preset sebenarnya — warna caption adalah data pengguna, bukan warna UI.
 */
export function PresetThumb({ id }: { id: CaptionPresetId }) {
  const style = presetStyle(id);
  const text = { color: style.textColor };
  const hit = { color: style.highlightColor };
  const heavy = { fontWeight: 800 } as const;
  return (
    <span
      aria-hidden
      className="block h-10 overflow-hidden rounded-xs bg-black text-xs"
    >
      {id === "karaoke" && (
        <span className={BASE} style={heavy}>
          <span style={hit}>KALAU</span>
          <span style={text}>HARUS</span>
        </span>
      )}
      {id === "pop" && (
        <span className={BASE} style={heavy}>
          <span style={text}>KALAU</span>
          <span className="text-base" style={hit}>
            HARUS
          </span>
        </span>
      )}
      {id === "highlight-box" && (
        <span className={BASE} style={heavy}>
          <span style={text}>KALAU</span>
          <span
            className="rounded-xs px-1 py-0.5"
            style={{ background: style.highlightColor, color: style.textColor }}
          >
            HARUS
          </span>
        </span>
      )}
      {id === "word-by-word" && (
        <span className={`${BASE} text-base`} style={{ ...heavy, ...text }}>
          HARUS
        </span>
      )}
      {id === "simple" && (
        <span className={BASE} style={text}>
          kalau harus dijelaskan
        </span>
      )}
      {id === "bold-uppercase" && (
        <span className={BASE} style={heavy}>
          <span style={text}>KALAU</span>
          <span style={hit}>HARUS</span>
        </span>
      )}
    </span>
  );
}
