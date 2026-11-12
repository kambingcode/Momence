export class InvalidVideoUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVideoUrlError";
  }
}

export type VideoPlatform = "youtube" | "twitch";

export interface ParsedVideoUrl {
  platform: VideoPlatform;
  videoId: string;
  /** Link kanonis satu video (tanpa playlist, waktu, atau pelacak). */
  url: string;
}

/** Nama platform untuk nama proyek sementara (sebelum worker mengisi judul video). */
export const PLATFORM_LABELS: Record<VideoPlatform, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TWITCH_ID = /^\d{1,20}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);
const TWITCH_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);
const TWITCH_CLIP_HOST = "clips.twitch.tv";
/** Path `/<prefix>/<id>` yang menunjuk satu video YouTube. */
const ID_PATH_PREFIXES = new Set(["shorts", "live", "embed", "v"]);

const INVALID =
  "Link tidak dikenali. Tempel link video YouTube (youtube.com/watch?v=…, youtu.be/…, /shorts/…) atau VOD Twitch (twitch.tv/videos/…).";
const TWITCH_ONLY_VOD =
  "Tempel link VOD Twitch, misalnya https://www.twitch.tv/videos/123456789.";

/** Ambil id video dari link YouTube atau VOD Twitch; melempar bila bukan link satu video. */
export function parseVideoUrl(input: string): ParsedVideoUrl {
  const text = input.trim();
  let url: URL;
  try {
    // Link tanpa skema (mis. "youtu.be/abc") tetap diterima.
    url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`,
    );
  } catch {
    throw new InvalidVideoUrlError(INVALID);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new InvalidVideoUrlError(INVALID);
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be" || YOUTUBE_HOSTS.has(host)) {
    return parseYouTube(host, url, segments);
  }
  if (host === TWITCH_CLIP_HOST) {
    throw new InvalidVideoUrlError(
      `Klip Twitch tidak didukung. ${TWITCH_ONLY_VOD}`,
    );
  }
  if (TWITCH_HOSTS.has(host)) return parseTwitch(segments);
  throw new InvalidVideoUrlError(INVALID);
}

function parseYouTube(
  host: string,
  url: URL,
  segments: string[],
): ParsedVideoUrl {
  let videoId: string | undefined;
  if (host === "youtu.be") {
    videoId = segments[0];
  } else if (segments[0] === "watch") {
    videoId = url.searchParams.get("v") ?? undefined;
  } else if (segments[0] && ID_PATH_PREFIXES.has(segments[0])) {
    videoId = segments[1];
  } else if (segments[0] === "playlist") {
    throw new InvalidVideoUrlError(
      "Link playlist tidak didukung; tempel link satu video.",
    );
  }

  if (!videoId || !YOUTUBE_ID.test(videoId)) {
    throw new InvalidVideoUrlError(INVALID);
  }
  return {
    platform: "youtube",
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function parseTwitch(segments: string[]): ParsedVideoUrl {
  const [first, second] = segments;
  if (first === "videos" && second && TWITCH_ID.test(second)) {
    return {
      platform: "twitch",
      videoId: second,
      url: `https://www.twitch.tv/videos/${second}`,
    };
  }
  if (first === "clips" || segments.includes("clip")) {
    throw new InvalidVideoUrlError(
      `Klip Twitch tidak didukung. ${TWITCH_ONLY_VOD}`,
    );
  }
  if (first === "collections") {
    throw new InvalidVideoUrlError(
      `Koleksi Twitch tidak didukung. ${TWITCH_ONLY_VOD}`,
    );
  }
  if (first && first !== "videos") {
    throw new InvalidVideoUrlError(
      `Link ini bukan VOD Twitch (kanal atau halaman lain). ${TWITCH_ONLY_VOD}`,
    );
  }
  throw new InvalidVideoUrlError(INVALID);
}
