import { describe, expect, it } from "vitest";
import { attachmentHeader, downloadFileName } from "./output";

describe("nama file unduhan", () => {
  it("membuang karakter berbahaya & emoji, mempertahankan huruf non-ASCII", () => {
    expect(downloadFileName('Rahasia "nabung" 50/30/20 🔥')).toBe(
      "Rahasia nabung 50 30 20.mp4",
    );
    expect(downloadFileName("Café — été")).toBe("Café été.mp4");
    expect(downloadFileName("../../etc/passwd")).toBe("etc passwd.mp4");
    expect(downloadFileName("🔥🔥")).toBe("klip.mp4");
  });

  it("dipotong 80 karakter", () => {
    expect(downloadFileName("a".repeat(200))).toBe(`${"a".repeat(80)}.mp4`);
  });

  it("header memuat nama ASCII cadangan & nama UTF-8", () => {
    expect(attachmentHeader("Café été.mp4")).toBe(
      `attachment; filename="Caf_ _t_.mp4"; filename*=UTF-8''Caf%C3%A9%20%C3%A9t%C3%A9.mp4`,
    );
  });
});
