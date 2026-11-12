import { describe, expect, it } from "vitest";
import { InvalidVideoUrlError, parseVideoUrl } from "./video-url";

const ID = "dQw4w9WgXcQ";
const CANONICAL = `https://www.youtube.com/watch?v=${ID}`;

describe("parseVideoUrl", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc&t=10`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
    `  www.youtube.com/watch?v=${ID}  `,
  ])("menerima %s", (input) => {
    expect(parseVideoUrl(input)).toEqual({
      platform: "youtube",
      videoId: ID,
      url: CANONICAL,
    });
  });

  it("menolak playlist dengan pesan khusus", () => {
    expect(() =>
      parseVideoUrl("https://www.youtube.com/playlist?list=PL123"),
    ).toThrow("playlist");
  });

  it.each([
    "",
    "bukan link",
    "https://vimeo.com/123456",
    `https://notyoutube.com/watch?v=${ID}`,
    `https://www.youtube.com.evil.test/watch?v=${ID}`,
    "https://www.youtube.com/watch?v=pendek",
    "https://www.youtube.com/@kanal",
    "https://youtu.be/",
    `ftp://youtu.be/${ID}`,
    `javascript:alert(1)//youtu.be/${ID}`,
  ])("menolak %j", (input) => {
    expect(() => parseVideoUrl(input)).toThrow(InvalidVideoUrlError);
  });
});

describe("parseVideoUrl — Twitch", () => {
  const VOD = "https://www.twitch.tv/videos/2907356012";

  it.each([
    "https://www.twitch.tv/videos/2907356012",
    "https://twitch.tv/videos/2907356012?t=1h2m3s",
    "https://m.twitch.tv/videos/2907356012",
    "http://www.twitch.tv/videos/2907356012/",
    "twitch.tv/videos/2907356012",
    "  www.twitch.tv/videos/2907356012?filter=archives  ",
  ])("menerima %s", (input) => {
    expect(parseVideoUrl(input)).toEqual({
      platform: "twitch",
      videoId: "2907356012",
      url: VOD,
    });
  });

  it.each([
    ["https://clips.twitch.tv/FunnyClipSlug", "Klip Twitch"],
    ["https://www.twitch.tv/preme/clip/FunnyClipSlug", "Klip Twitch"],
    ["https://www.twitch.tv/clips/FunnyClipSlug", "Klip Twitch"],
    ["https://www.twitch.tv/collections/abc123", "Koleksi Twitch"],
    ["https://www.twitch.tv/preme", "bukan VOD Twitch"],
    ["https://www.twitch.tv/preme/videos", "bukan VOD Twitch"],
    [
      "https://www.twitch.tv/directory/game/Just%20Chatting",
      "bukan VOD Twitch",
    ],
  ])("menolak %s dengan pesan khusus", (input, message) => {
    expect(() => parseVideoUrl(input)).toThrow(message);
  });

  it.each([
    "https://www.twitch.tv/",
    "https://www.twitch.tv/videos",
    "https://www.twitch.tv/videos/bukan-angka",
    "https://twitch.tv.evil.test/videos/2907356012",
    "https://nottwitch.tv/videos/2907356012",
    "https://www.twitch.tv.evil.test/videos/2907356012",
  ])("menolak %j", (input) => {
    expect(() => parseVideoUrl(input)).toThrow(InvalidVideoUrlError);
  });
});
