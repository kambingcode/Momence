import { describe, expect, it } from "vitest";
import { pickVideoFile, type VideoFile } from "./video-files";

const file = (width: number, height: number, fileType = "video/mp4") => ({
  width,
  height,
  fileType,
  link: `https://videos.example/${width}x${height}`,
});

describe("pickVideoFile", () => {
  const files: VideoFile[] = [
    file(2160, 3840),
    file(540, 960),
    file(1080, 1920),
    file(360, 640),
    file(1440, 2560, "video/webm"),
    file(0, 0),
  ];

  it("MP4 terkecil yang sisi pendeknya cukup", () => {
    expect(pickVideoFile(files, 1080)?.link).toContain("1080x1920");
    expect(pickVideoFile(files, 540)?.link).toContain("540x960");
    expect(pickVideoFile([file(1920, 1080)], 1080)?.link).toContain(
      "1920x1080",
    );
  });

  it("semuanya terlalu kecil → yang terbesar; tanpa MP4 → null", () => {
    expect(
      pickVideoFile([file(360, 640), file(720, 1280)], 1080)?.link,
    ).toContain("720x1280");
    expect(pickVideoFile([file(1080, 1920, "video/webm")], 1080)).toBeNull();
  });
});
