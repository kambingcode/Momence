import { describe, expect, it } from "vitest";
import {
  type EditingScriptInput,
  editingScriptInputSchema,
  emptyEditingScriptInput,
} from "./editing-script";
import {
  MAX_TEXT_OVERLAYS,
  type TextOverlay,
  textOverlaySchema,
  textOverlaysSchema,
} from "./text-overlay";

const overlay = (overrides: Partial<TextOverlay> = {}): TextOverlay => ({
  id: "t1",
  text: "Não é só isso, né?",
  startMs: 1_000,
  endMs: 4_000,
  x: 50,
  y: 80,
  fontSize: 6,
  color: "#ffffff",
  font: "montserrat",
  ...overrides,
});

const firstMessage = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("textOverlaySchema", () => {
  it("menerima teks lengkap (aksen dipertahankan) dan isi kosong", () => {
    expect(textOverlaySchema.parse(overlay())).toEqual(overlay());
    expect(textOverlaySchema.safeParse(overlay({ text: "" })).success).toBe(
      true,
    );
  });

  it("menolak rentang kosong, posisi di luar frame, ukuran, warna & font tidak valid", () => {
    const bad: [Partial<TextOverlay>, string][] = [
      [{ endMs: 1_000 }, "Rentang teks kosong"],
      [{ x: -1 }, "Posisi teks harus di dalam frame (0–100%)"],
      [{ y: 101 }, "Posisi teks harus di dalam frame (0–100%)"],
      [{ fontSize: 1 }, "Ukuran teks harus 2–30% lebar frame"],
      [{ fontSize: 31 }, "Ukuran teks harus 2–30% lebar frame"],
      [{ color: "white" }, "Warna teks harus hex #rrggbb"],
      [{ text: "a".repeat(201) }, "Teks maksimal 200 karakter"],
    ];
    for (const [overrides, message] of bad)
      expect(
        firstMessage(textOverlaySchema.safeParse(overlay(overrides))),
      ).toBe(message);
    expect(
      textOverlaySchema.safeParse({ ...overlay(), font: "comic-sans" }).success,
    ).toBe(false);
  });
});

describe("textOverlaysSchema", () => {
  it(`maksimal ${MAX_TEXT_OVERLAYS} teks, id unik`, () => {
    const many = Array.from({ length: MAX_TEXT_OVERLAYS }, (_, i) =>
      overlay({ id: `t${i}` }),
    );
    expect(textOverlaysSchema.safeParse(many).success).toBe(true);
    expect(
      firstMessage(
        textOverlaysSchema.safeParse([...many, overlay({ id: "lebih" })]),
      ),
    ).toBe("Maksimal 8 teks per klip");
    expect(
      firstMessage(textOverlaysSchema.safeParse([overlay(), overlay()])),
    ).toBe("Id teks ganda");
  });

  it("EditingScript dari sebelum teks custom → tanpa teks", () => {
    const old: Partial<EditingScriptInput> = emptyEditingScriptInput();
    delete old.textOverlays;
    expect(editingScriptInputSchema.parse(old).textOverlays).toEqual([]);
  });
});
