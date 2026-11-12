import type { PostCopyResult, PostPlatform } from "@/shared/schemas";

export const PLATFORM_LABELS: Record<PostPlatform, string> = {
  tiktok: "TikTok",
  reels: "Reels",
  shorts: "Shorts",
};

/** Hashtag dipisah spasi, siap ditempel di kolom caption platform. */
export const hashtagLine = (copy: Pick<PostCopyResult, "hashtags">): string =>
  copy.hashtags.join(" ");

/** Caption + hashtag sebagai satu teks posting (hashtag di paragraf baru). */
export function fullPost(
  copy: Pick<PostCopyResult, "caption" | "hashtags">,
  caption: string = copy.caption,
): string {
  const tags = hashtagLine(copy);
  return tags ? `${caption}\n\n${tags}` : caption;
}
