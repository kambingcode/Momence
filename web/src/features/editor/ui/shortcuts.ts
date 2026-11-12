export interface Shortcut {
  action: string;
  /** Tombol alternatif (mis. ⌫ atau Del), masing-masing satu chip `Kbd`. */
  keys: readonly string[];
}

/**
 * Pintasan yang benar-benar berfungsi di editor (dipakai dialog "Pintasan keyboard"): Spasi,
 * ⌘S, ⌘Z/⌘⇧Z, `?` = listener global halaman; sisanya ada di panel transkrip.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  { action: "Putar / jeda", keys: ["Spasi"] },
  { action: "Simpan", keys: ["⌘S"] },
  { action: "Urungkan", keys: ["⌘Z"] },
  { action: "Ulangi", keys: ["⌘⇧Z"] },
  { action: "Pindah kursor", keys: ["←", "→"] },
  { action: "Perluas seleksi", keys: ["⇧←", "⇧→"] },
  { action: "Potong seleksi", keys: ["⌫", "Del"] },
  { action: "Edit kata", keys: ["Enter"] },
  { action: "Batalkan seleksi", keys: ["Esc"] },
  { action: "Pintasan", keys: ["?"] },
];
