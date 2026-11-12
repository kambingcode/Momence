import { describe, expect, it } from "vitest";
import { pickWordState, type WordFlags } from "./word-state-styles";

const none: WordFlags = {
  finding: false,
  active: false,
  selected: false,
  removed: false,
  corrected: false,
  filler: false,
};

describe("pickWordState", () => {
  it("kata polos → null", () => {
    expect(pickWordState(none)).toBeNull();
  });

  it("satu keadaan → keadaan itu", () => {
    expect(pickWordState({ ...none, filler: true })).toBe("filler");
    expect(pickWordState({ ...none, corrected: true })).toBe("corrected");
  });

  it("prioritas: temuan → aktif → seleksi → terpotong → terkoreksi → filler", () => {
    const all: WordFlags = {
      finding: true,
      active: true,
      selected: true,
      removed: true,
      corrected: true,
      filler: true,
    };
    const order = [
      "finding",
      "active",
      "selected",
      "removed",
      "corrected",
      "filler",
    ] as const;
    const flags = { ...all };
    for (const state of order) {
      expect(pickWordState(flags)).toBe(state);
      flags[state] = false;
    }
    expect(pickWordState(flags)).toBeNull();
  });

  it("filler yang dikoreksi tampil sebagai terkoreksi; yang terpotong sebagai terpotong", () => {
    expect(pickWordState({ ...none, filler: true, corrected: true })).toBe(
      "corrected",
    );
    expect(pickWordState({ ...none, filler: true, removed: true })).toBe(
      "removed",
    );
  });
});
