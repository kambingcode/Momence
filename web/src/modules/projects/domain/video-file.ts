export const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "webm", "mkv"] as const;
export type VideoExtension = (typeof VIDEO_EXTENSIONS)[number];

export class InvalidVideoFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVideoFileError";
  }
}

const MAX_NAME_LENGTH = 120;

/** Ekstensi (huruf kecil) dari nama file; melempar bila bukan video yang didukung. */
export function videoExtensionOf(filename: string): VideoExtension {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  const ext = match?.[1]?.toLowerCase();
  if (!ext || !(VIDEO_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new InvalidVideoFileError(
      `Format tidak didukung. Gunakan: ${VIDEO_EXTENSIONS.join(", ")}`,
    );
  }
  return ext as VideoExtension;
}

/** Nama proyek default = nama file tanpa folder & ekstensi. */
export function projectNameFrom(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const name = base.replace(/\.[^.]+$/, "").trim();
  return (name || "Video tanpa nama").slice(0, MAX_NAME_LENGTH);
}
