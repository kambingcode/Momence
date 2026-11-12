import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Video uji e2e: ucapan TTS macOS (`say`) di atas pola uji ffmpeg, ±40 dtk per bahasa — cukup
 * untuk dua klip 15 dtk dari server Gemini palsu. Berisi filler ("eh") untuk Speech cleanup.
 */
export const VIDEOS = {
  id: {
    file: "e2e-bahasa-indonesia.mp4",
    voice: "Damayanti",
    text:
      "Halo semuanya, selamat datang kembali di kanal ini. Hari ini kita akan belajar cara " +
      "membuat video pendek yang menarik. Eh, sebenarnya caranya cukup mudah. Langkah pertama, " +
      "rekam video dengan cahaya yang terang dan suara yang jelas. Langkah kedua, potong bagian " +
      "yang membosankan supaya penonton tidak pergi. Langkah ketiga, tambahkan teks di layar " +
      "agar pesan mudah dipahami. Terakhir, unggah video kamu di waktu yang tepat. Kalau kamu " +
      "konsisten setiap minggu, penonton akan terus bertambah. Terima kasih sudah menonton, " +
      "sampai jumpa di video berikutnya.",
  },
  en: {
    file: "e2e-english.mp4",
    voice: "Samantha",
    text:
      "Hello everyone, and welcome back to the channel. Today we are going to learn how to " +
      "make short videos that people actually watch. Um, it is easier than you think. First, " +
      "record your video with bright light and clear sound. Second, cut the boring parts so " +
      "your viewers do not leave. Third, add text on the screen so the message is easy to " +
      "follow. Finally, upload your video at the right time. If you stay consistent every " +
      "week, your audience will keep growing. Thanks for watching, and see you in the next " +
      "video.",
  },
} as const;

export type VideoLanguage = keyof typeof VIDEOS;

export function videoPath(dir: string, language: VideoLanguage): string {
  return path.join(dir, VIDEOS[language].file);
}

/** Buat video uji yang belum ada di `dir` (butuh macOS `say` & ffmpeg). */
export function ensureVideos(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const language of Object.keys(VIDEOS) as VideoLanguage[]) {
    const output = videoPath(dir, language);
    if (existsSync(output)) continue;
    const { voice, text } = VIDEOS[language];
    const speech = `${output}.aiff`;
    execFileSync("say", ["-v", voice, "-o", speech, text]);
    execFileSync("ffmpeg", [
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=1280x720:rate=30",
      "-i",
      speech,
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      output,
    ]);
  }
}
