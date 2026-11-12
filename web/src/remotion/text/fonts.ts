import { loadFont as loadBangers } from "@remotion/google-fonts/Bangers";
import { loadFont as loadLobster } from "@remotion/google-fonts/Lobster";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadPacifico } from "@remotion/google-fonts/Pacifico";
import { loadFont as loadPermanentMarker } from "@remotion/google-fonts/PermanentMarker";
import { loadFont as loadPlayfairDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadRobotoSlab } from "@remotion/google-fonts/RobotoSlab";
import type { TextFont } from "@/shared/schemas";
import { captionFont } from "../captions/fonts";

interface FontFace {
  family: string;
  weight: number;
}

/** Nama font untuk ditampilkan di editor. */
export const TEXT_FONT_LABELS: Record<TextFont, string> = {
  montserrat: "Montserrat",
  poppins: "Poppins",
  inter: "Inter",
  anton: "Anton",
  "bebas-neue": "Bebas Neue",
  oswald: "Oswald",
  "playfair-display": "Playfair Display",
  "roboto-slab": "Roboto Slab",
  lobster: "Lobster",
  pacifico: "Pacifico",
  bangers: "Bangers",
  "permanent-marker": "Permanent Marker",
};

// Lima font pertama dipakai bersama caption (ketebalan yang sama, jadi tidak diunduh dua kali);
// sisanya hanya subset latin (mencakup aksen ã, ç, é) & satu ketebalan.
const LOADERS: Record<TextFont, () => FontFace> = {
  montserrat: () => captionFont("montserrat"),
  poppins: () => captionFont("poppins"),
  inter: () => captionFont("inter"),
  anton: () => captionFont("anton"),
  "bebas-neue": () => captionFont("bebas-neue"),
  oswald: () => ({
    family: loadOswald("normal", { weights: ["700"], subsets: ["latin"] })
      .fontFamily,
    weight: 700,
  }),
  "playfair-display": () => ({
    family: loadPlayfairDisplay("normal", {
      weights: ["700"],
      subsets: ["latin"],
    }).fontFamily,
    weight: 700,
  }),
  "roboto-slab": () => ({
    family: loadRobotoSlab("normal", { weights: ["700"], subsets: ["latin"] })
      .fontFamily,
    weight: 700,
  }),
  lobster: () => ({
    family: loadLobster("normal", { weights: ["400"], subsets: ["latin"] })
      .fontFamily,
    weight: 400,
  }),
  pacifico: () => ({
    family: loadPacifico("normal", { weights: ["400"], subsets: ["latin"] })
      .fontFamily,
    weight: 400,
  }),
  bangers: () => ({
    family: loadBangers("normal", { weights: ["400"], subsets: ["latin"] })
      .fontFamily,
    weight: 400,
  }),
  "permanent-marker": () => ({
    family: loadPermanentMarker("normal", {
      weights: ["400"],
      subsets: ["latin"],
    }).fontFamily,
    weight: 400,
  }),
};

const loaded = new Map<TextFont, FontFace>();

/**
 * Font teks custom (Google Fonts, OFL), dimuat sekali per font saat pertama dipakai. Saat render,
 * `loadFont` menahan frame sampai font siap.
 */
export function textFont(font: TextFont): FontFace {
  let face = loaded.get(font);
  if (!face) {
    face = LOADERS[font]();
    loaded.set(font, face);
  }
  return face;
}
