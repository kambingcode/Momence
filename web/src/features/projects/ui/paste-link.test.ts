import { describe, expect, it } from "vitest";
import { looksLikeVideoLink } from "./paste-link";

describe("looksLikeVideoLink", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "youtu.be/dQw4w9WgXcQ",
    "  https://youtu.be/dQw4w9WgXcQ\n",
    "https://m.youtube.com/shorts/abc",
    "https://www.twitch.tv/videos/123456789",
    "HTTPS://YOUTU.BE/X",
  ])("menerima %s", (text) => {
    expect(looksLikeVideoLink(text)).toBe(true);
  });

  it.each([
    "",
    "halo dunia",
    "https://example.com/video.mp4",
    // Google Drive belum didukung di main (PR T19.2 menambahkannya).
    "https://drive.google.com/file/d/1AbC/view?usp=sharing",
    "https://youtube.com.evil.example/watch",
    "https://notyoutube.com/watch?v=x",
    "lihat https://youtu.be/x ini",
    `https://youtu.be/${"a".repeat(2100)}`,
  ])("menolak %j", (text) => {
    expect(looksLikeVideoLink(text)).toBe(false);
  });
});
