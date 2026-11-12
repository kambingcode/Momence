/**
 * Melepas dekoder & buffer frame sebuah `<video>` sekarang juga. Safari (proses "Graphics and
 * Media") baru membebaskannya saat elemen di-GC, jadi tanpa ini setiap kunjungan ke daftar klip
 * menumpuk ±45 MB per video.
 */
export function releaseVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}
