import { describe, expect, it } from "vitest";
import { CLIP_FOCUS_MAX_LENGTH, clipFocusSchema } from "./clip-focus";

describe("clipFocusSchema", () => {
  it("merapikan spasi dan mempertahankan isi", () => {
    expect(clipFocusSchema.parse("  momen lucu dan reaksi \n")).toBe(
      "momen lucu dan reaksi",
    );
  });

  it.each([undefined, null, "", "   \n\t"])("%j → null", (value) => {
    expect(clipFocusSchema.parse(value)).toBeNull();
  });

  it("menerima tepat batas maksimum dan menolak lebih", () => {
    const atLimit = "a".repeat(CLIP_FOCUS_MAX_LENGTH);
    expect(clipFocusSchema.parse(atLimit)).toBe(atLimit);
    const result = clipFocusSchema.safeParse(atLimit + "a");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("500");
  });

  it("menghitung panjang setelah trim", () => {
    const padded = ` ${"a".repeat(CLIP_FOCUS_MAX_LENGTH)} `;
    expect(clipFocusSchema.safeParse(padded).success).toBe(true);
  });
});
