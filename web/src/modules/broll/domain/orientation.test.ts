import { describe, expect, it } from "vitest";
import { orientationFirst, orientationOf } from "./orientation";

describe("orientasi video", () => {
  it("orientationOf dengan toleransi persegi", () => {
    expect(orientationOf(1080, 1920)).toBe("portrait");
    expect(orientationOf(1920, 1080)).toBe("landscape");
    expect(orientationOf(1080, 1080)).toBe("square");
    expect(orientationOf(1080, 1000)).toBe("square");
  });

  it("orientationFirst: yang cocok di depan, urutan relevansi dipertahankan", () => {
    const v = (id: number, width: number, height: number) => ({
      id,
      width,
      height,
    });
    const videos = [
      v(1, 1920, 1080),
      v(2, 1080, 1920),
      v(3, 1280, 720),
      v(4, 720, 1280),
    ];
    expect(orientationFirst(videos, "portrait").map((x) => x.id)).toEqual([
      2, 4, 1, 3,
    ]);
    expect(orientationFirst(videos, "square").map((x) => x.id)).toEqual([
      1, 2, 3, 4,
    ]);
  });
});
