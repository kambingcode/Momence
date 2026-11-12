/**
 * Thumbnail proyek dibuat worker saat ingest di folder yang sama dengan proxy-nya
 * (`media/<id>/proxy.mp4` → `media/<id>/thumb.jpg`). Tanpa kolom DB: ada tidaknya file = ada
 * tidaknya thumbnail.
 */
export function thumbnailPath(proxyPath: string): string {
  const slash = proxyPath.lastIndexOf("/");
  return `${slash < 0 ? "" : proxyPath.slice(0, slash + 1)}thumb.jpg`;
}
