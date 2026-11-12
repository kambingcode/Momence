import { describe, expect, it } from "vitest";
import { thumbnailPath } from "./thumbnail";

describe("thumbnailPath", () => {
  it("satu folder dengan proxy", () => {
    expect(thumbnailPath("media/p1/proxy.mp4")).toBe("media/p1/thumb.jpg");
  });

  it("proxy tanpa folder", () => {
    expect(thumbnailPath("proxy.mp4")).toBe("thumb.jpg");
  });
});
