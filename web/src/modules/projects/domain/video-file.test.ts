import { describe, expect, it } from "vitest";
import {
  InvalidVideoFileError,
  projectNameFrom,
  videoExtensionOf,
} from "./video-file";

describe("videoExtensionOf", () => {
  it("menerima ekstensi video yang didukung tanpa peduli huruf besar", () => {
    expect(videoExtensionOf("Rekaman.MOV")).toBe("mov");
    expect(videoExtensionOf("a.b.mp4")).toBe("mp4");
  });

  it("menolak file tanpa ekstensi atau bukan video", () => {
    expect(() => videoExtensionOf("video")).toThrow(InvalidVideoFileError);
    expect(() => videoExtensionOf("catatan.txt")).toThrow(
      InvalidVideoFileError,
    );
    expect(() => videoExtensionOf("x.mp4.exe")).toThrow(InvalidVideoFileError);
  });
});

describe("projectNameFrom", () => {
  it("membuang folder & ekstensi", () => {
    expect(projectNameFrom("C:\\Users\\a\\Podcast Ep 1.mp4")).toBe(
      "Podcast Ep 1",
    );
    expect(projectNameFrom("/tmp/wawancara.final.mov")).toBe("wawancara.final");
  });

  it("memberi nama default dan membatasi panjang", () => {
    expect(projectNameFrom(".mp4")).toBe("Video tanpa nama");
    expect(projectNameFrom(`${"a".repeat(300)}.mp4`)).toHaveLength(120);
  });
});
