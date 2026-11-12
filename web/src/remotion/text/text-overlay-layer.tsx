import { Sequence, useVideoConfig } from "remotion";
import type {
  ClipRenderProps,
  TextOverlayStyle,
} from "@/modules/render/application";
import { textFont } from "./fonts";

/** Lebar maksimum kotak teks (bagian lebar frame); teks yang lebih panjang membungkus baris. */
export const TEXT_BOX_MAX_WIDTH = 0.8;

/**
 * Satu teks berpusat di (`x`%, `y`%) frame; ukuran huruf = persen lebar frame sehingga sama di
 * semua rasio. Kotak selebar isinya (maks. 80% frame), rata tengah, baris baru dipertahankan.
 */
function TextOverlayBox({ overlay }: { overlay: TextOverlayStyle }) {
  const { width } = useVideoConfig();
  const face = textFont(overlay.font);
  return (
    <div
      style={{
        position: "absolute",
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        width: 0,
        height: 0,
      }}
    >
      <div
        data-text-overlay={overlay.id}
        style={{
          position: "absolute",
          transform: "translate(-50%, -50%)",
          width: "max-content",
          maxWidth: width * TEXT_BOX_MAX_WIDTH,
          fontFamily: face.family,
          fontWeight: face.weight,
          fontSize: (overlay.fontSize / 100) * width,
          lineHeight: 1.15,
          color: overlay.color,
          textAlign: "center",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
        }}
      >
        {overlay.text}
      </div>
    </div>
  );
}

/** Teks custom: muncul/hilang tanpa animasi; urutan daftar = urutan tumpuk (terakhir di depan). */
export function TextOverlayLayer({
  items,
}: {
  items: ClipRenderProps["textOverlays"];
}) {
  return items
    .filter((sequence) => sequence.overlay.text.trim() !== "")
    .map((sequence) => (
      <Sequence
        key={`${sequence.overlay.id}-${sequence.fromFrame}`}
        from={sequence.fromFrame}
        durationInFrames={sequence.durationInFrames}
      >
        <TextOverlayBox overlay={sequence.overlay} />
      </Sequence>
    ));
}
