import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadBebasNeue } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import type { CaptionFont } from "@/modules/captions/application";

interface FontFace {
  family: string;
  /** Ketebalan utama caption (Anton & Bebas Neue hanya punya 400, sudah tebal). */
  weight: number;
}

// Hanya subset latin & ketebalan yang dipakai, agar unduhan font kecil.
const LOADERS: Record<CaptionFont, () => FontFace> = {
  montserrat: () => ({
    family: loadMontserrat("normal", { weights: ["800"], subsets: ["latin"] })
      .fontFamily,
    weight: 800,
  }),
  poppins: () => ({
    family: loadPoppins("normal", { weights: ["800"], subsets: ["latin"] })
      .fontFamily,
    weight: 800,
  }),
  inter: () => ({
    family: loadInter("normal", { weights: ["700"], subsets: ["latin"] })
      .fontFamily,
    weight: 700,
  }),
  anton: () => ({
    family: loadAnton("normal", { weights: ["400"], subsets: ["latin"] })
      .fontFamily,
    weight: 400,
  }),
  "bebas-neue": () => ({
    family: loadBebasNeue("normal", { weights: ["400"], subsets: ["latin"] })
      .fontFamily,
    weight: 400,
  }),
};

const loaded = new Map<CaptionFont, FontFace>();

/**
 * Font caption (Google Fonts, OFL), dimuat sekali per font saat pertama dipakai. Saat render,
 * `loadFont` menahan frame sampai font siap.
 */
export function captionFont(font: CaptionFont): FontFace {
  let face = loaded.get(font);
  if (!face) {
    face = LOADERS[font]();
    loaded.set(font, face);
  }
  return face;
}
