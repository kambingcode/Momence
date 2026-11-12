import { describe, expect, it } from "vitest";
import { errorMessage } from "./api";

describe("errorMessage", () => {
  it("memakai pesan dari API bila ada", async () => {
    const response = Response.json(
      { error: "Klip tidak ditemukan" },
      { status: 404 },
    );
    expect(await errorMessage(response)).toBe("Klip tidak ditemukan");
  });

  it("galat server tanpa JSON (halaman 500 Next.js) → arahkan ke log server", async () => {
    const message = await errorMessage(new Response("<html>", { status: 500 }));
    expect(message).toContain("galat di server web (500)");
    expect(message).toContain("npm run dev");
    expect(await errorMessage(new Response(null, { status: 404 }))).toBe(
      "Server membalas 404",
    );
  });
});
