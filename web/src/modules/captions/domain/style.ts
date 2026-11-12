/** Preset caption (cermin `captionPresetSchema`). */
export type CaptionPresetId =
  | "karaoke"
  | "pop"
  | "highlight-box"
  | "word-by-word"
  | "simple"
  | "bold-uppercase";

/** Font Google Fonts berlisensi OFL (cermin `captionFontSchema`). */
export type CaptionFont =
  "montserrat" | "poppins" | "anton" | "bebas-neue" | "inter";

export type CaptionPosition = "top" | "middle" | "bottom";

/** Gaya caption yang disimpan di EditingScript (cermin `captionStyleSchema`). */
export interface CaptionStyle {
  preset: CaptionPresetId;
  font: CaptionFont;
  /** Teks biasa. */
  textColor: string;
  /** Kata yang sedang diucapkan. */
  highlightColor: string;
  /** Kata kunci pilihan Gemini. */
  keywordColor: string;
  /** Piksel pada kanvas selebar 1080 px. */
  size: number;
  position: CaptionPosition;
  uppercase: boolean;
}

/** Batas satu halaman caption (teks yang tampil bersamaan). */
export interface PageRules {
  maxWords: number;
  maxChars: number;
}

export interface CaptionPreset {
  label: string;
  description: string;
  rules: PageRules;
  defaults: Omit<CaptionStyle, "preset">;
}

export const CAPTION_PRESETS: Record<CaptionPresetId, CaptionPreset> = {
  karaoke: {
    label: "Karaoke fill",
    description: "Kata terisi warna mengikuti ucapan",
    rules: { maxWords: 6, maxChars: 26 },
    defaults: {
      font: "montserrat",
      textColor: "#ffffff",
      highlightColor: "#facc15",
      keywordColor: "#4ade80",
      size: 80,
      position: "bottom",
      uppercase: false,
    },
  },
  pop: {
    label: "Pop",
    description: "Kata yang diucapkan membesar & berwarna",
    rules: { maxWords: 4, maxChars: 20 },
    defaults: {
      font: "poppins",
      textColor: "#ffffff",
      highlightColor: "#22c55e",
      keywordColor: "#facc15",
      size: 88,
      position: "bottom",
      uppercase: false,
    },
  },
  "highlight-box": {
    label: "Highlight box",
    description: "Kotak warna di belakang kata yang diucapkan",
    rules: { maxWords: 5, maxChars: 24 },
    defaults: {
      font: "montserrat",
      textColor: "#ffffff",
      highlightColor: "#8b5cf6",
      keywordColor: "#facc15",
      size: 78,
      position: "bottom",
      uppercase: false,
    },
  },
  "word-by-word": {
    label: "Word-by-word",
    description: "Satu kata sekaligus, muncul dengan pantulan",
    rules: { maxWords: 1, maxChars: 40 },
    defaults: {
      font: "anton",
      textColor: "#ffffff",
      highlightColor: "#ffffff",
      keywordColor: "#facc15",
      size: 140,
      position: "middle",
      uppercase: true,
    },
  },
  simple: {
    label: "Simple",
    description: "Teks polos tanpa animasi",
    rules: { maxWords: 12, maxChars: 42 },
    defaults: {
      font: "inter",
      textColor: "#ffffff",
      highlightColor: "#ffffff",
      keywordColor: "#ffffff",
      size: 60,
      position: "bottom",
      uppercase: false,
    },
  },
  "bold-uppercase": {
    label: "Bold uppercase",
    description: "Huruf besar tebal, kata yang diucapkan berwarna",
    rules: { maxWords: 3, maxChars: 18 },
    defaults: {
      font: "bebas-neue",
      textColor: "#ffffff",
      highlightColor: "#facc15",
      keywordColor: "#4ade80",
      size: 128,
      position: "middle",
      uppercase: true,
    },
  },
};

export const CAPTION_PRESET_IDS = Object.keys(
  CAPTION_PRESETS,
) as CaptionPresetId[];

export const DEFAULT_CAPTION_PRESET: CaptionPresetId = "karaoke";

/** Gaya bawaan sebuah preset. */
export const presetStyle = (
  preset: CaptionPresetId = DEFAULT_CAPTION_PRESET,
): CaptionStyle => ({ preset, ...CAPTION_PRESETS[preset].defaults });
