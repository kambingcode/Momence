/** Isi textarea daftar filler → entri: satu per baris atau dipisah koma. */
export function parseEntries(text: string): string[] {
  return text
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function formatEntries(entries: readonly string[]): string {
  return entries.join("\n");
}
