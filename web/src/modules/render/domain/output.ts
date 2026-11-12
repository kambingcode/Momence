const MAX_NAME_LENGTH = 80;

/**
 * Nama file unduhan dari judul klip: hanya huruf, angka, spasi, `-` dan `_` (tanpa `/`, kutip,
 * atau emoji yang bisa merusak header/sistem file), paling panjang 80 karakter, berakhiran `.mp4`.
 */
export function downloadFileName(title: string): string {
  const name = title
    .replace(/[^\p{L}\p{N} _-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return `${name || "klip"}.mp4`;
}

/** Header Content-Disposition unduhan, dengan nama ASCII cadangan + nama UTF-8 (RFC 6266). */
export function attachmentHeader(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
