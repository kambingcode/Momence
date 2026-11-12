import { describe, expect, it } from "vitest";
import {
  autoDismissMs,
  AUTO_DISMISS_MS,
  MAX_TOASTS,
  type Toast,
  toastReducer,
} from "./toast-state";

const toast = (id: string, over: Partial<Toast> = {}): Toast => ({
  id,
  variant: "info",
  title: id,
  ...over,
});
const ids = (list: readonly Toast[]) => list.map((t) => t.id);

describe("toastReducer", () => {
  it("menambah di belakang dan menutup lewat id", () => {
    let state = toastReducer([], { type: "push", toast: toast("a") });
    state = toastReducer(state, { type: "push", toast: toast("b") });
    expect(ids(state)).toEqual(["a", "b"]);
    expect(ids(toastReducer(state, { type: "dismiss", id: "a" }))).toEqual([
      "b",
    ]);
  });

  it("membatasi jumlah dan mengusir toast non-galat tertua lebih dulu", () => {
    let state: Toast[] = [];
    for (const t of [
      toast("err", { variant: "error" }),
      toast("a"),
      toast("b"),
      toast("c"),
    ])
      state = toastReducer(state, { type: "push", toast: t });
    expect(state).toHaveLength(MAX_TOASTS);
    expect(ids(state)).toEqual(["err", "b", "c"]);
  });

  it("bila semuanya galat, galat tertua yang diusir", () => {
    let state: Toast[] = [];
    for (const id of ["e1", "e2", "e3", "e4"])
      state = toastReducer(state, {
        type: "push",
        toast: toast(id, { variant: "error" }),
      });
    expect(ids(state)).toEqual(["e2", "e3", "e4"]);
  });

  it("toast ber-key sama menggantikan yang lama", () => {
    let state = toastReducer([], {
      type: "push",
      toast: toast("a", { key: "render" }),
    });
    state = toastReducer(state, { type: "push", toast: toast("b") });
    state = toastReducer(state, {
      type: "push",
      toast: toast("c", { key: "render" }),
    });
    expect(ids(state)).toEqual(["b", "c"]);
  });

  it("menutup id yang tidak ada tidak mengubah apa pun", () => {
    const state = [toast("a")];
    expect(ids(toastReducer(state, { type: "dismiss", id: "x" }))).toEqual([
      "a",
    ]);
  });
});

describe("autoDismissMs", () => {
  it("info & sukses hilang sendiri, galat menetap", () => {
    expect(autoDismissMs({ variant: "info" })).toBe(AUTO_DISMISS_MS);
    expect(autoDismissMs({ variant: "success" })).toBe(AUTO_DISMISS_MS);
    expect(autoDismissMs({ variant: "error" })).toBeNull();
  });
});
