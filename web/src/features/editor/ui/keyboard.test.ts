import { describe, expect, it } from "vitest";
import {
  isInteractiveTarget,
  isPlayPauseKey,
  isShortcutsHelpKey,
  isTextInput,
} from "./keyboard";
import { SHORTCUTS } from "./shortcuts";

const element = ({
  tagName = "DIV",
  role = null as string | null,
  contentEditable = false,
  inOverlay = false,
} = {}) =>
  ({
    tagName,
    isContentEditable: contentEditable,
    getAttribute: (name: string) => (name === "role" ? role : null),
    closest: () => (inOverlay ? {} : null),
  }) as unknown as EventTarget;

const space = (overrides: Partial<KeyboardEvent> = {}) => ({
  code: "Space",
  key: " ",
  repeat: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  target: element(),
  ...overrides,
});

describe("isTextInput", () => {
  it("mengenali input, textarea, select & contentEditable", () => {
    expect(isTextInput(element({ tagName: "INPUT" }))).toBe(true);
    expect(isTextInput(element({ tagName: "TEXTAREA" }))).toBe(true);
    expect(isTextInput(element({ tagName: "SELECT" }))).toBe(true);
    expect(isTextInput(element({ contentEditable: true }))).toBe(true);
  });

  it("bukan untuk div biasa atau target non-elemen", () => {
    expect(isTextInput(element())).toBe(false);
    expect(isTextInput(null)).toBe(false);
    expect(isTextInput({} as EventTarget)).toBe(false);
  });
});

describe("isInteractiveTarget", () => {
  it("tombol, link & role interaktif memakai Space sendiri", () => {
    expect(isInteractiveTarget(element({ tagName: "BUTTON" }))).toBe(true);
    expect(isInteractiveTarget(element({ tagName: "A" }))).toBe(true);
    expect(isInteractiveTarget(element({ role: "menuitem" }))).toBe(true);
    expect(isInteractiveTarget(element({ role: "slider" }))).toBe(true);
  });

  it("apa pun di dalam dialog/menu termasuk interaktif", () => {
    expect(isInteractiveTarget(element({ inOverlay: true }))).toBe(true);
  });

  it("panel transkrip (role textbox tanpa contentEditable) & body tidak", () => {
    expect(isInteractiveTarget(element({ role: "textbox" }))).toBe(false);
    expect(isInteractiveTarget(element({ tagName: "BODY" }))).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });
});

describe("isPlayPauseKey", () => {
  it("Space biasa di luar elemen interaktif", () => {
    expect(isPlayPauseKey(space())).toBe(true);
    expect(isPlayPauseKey(space({ code: "", key: " " }))).toBe(true);
  });

  it("bukan untuk tombol lain, modifier, atau auto-repeat", () => {
    expect(isPlayPauseKey(space({ code: "KeyK", key: "k" }))).toBe(false);
    expect(isPlayPauseKey(space({ repeat: true }))).toBe(false);
    expect(isPlayPauseKey(space({ metaKey: true }))).toBe(false);
    expect(isPlayPauseKey(space({ ctrlKey: true }))).toBe(false);
    expect(isPlayPauseKey(space({ altKey: true }))).toBe(false);
    expect(isPlayPauseKey(space({ shiftKey: true }))).toBe(false);
  });

  it("bukan saat fokus di tombol atau input", () => {
    expect(
      isPlayPauseKey(space({ target: element({ tagName: "BUTTON" }) })),
    ).toBe(false);
    expect(
      isPlayPauseKey(space({ target: element({ tagName: "INPUT" }) })),
    ).toBe(false);
  });
});

describe("isShortcutsHelpKey", () => {
  const help = (overrides: Partial<KeyboardEvent> = {}) => ({
    key: "?",
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: element(),
    ...overrides,
  });

  it("'?' di luar elemen interaktif membuka pintasan", () => {
    expect(isShortcutsHelpKey(help())).toBe(true);
  });

  it.each([
    ["ketik di input", { target: element({ tagName: "INPUT" }) }],
    ["di dalam dialog", { target: element({ inOverlay: true }) }],
    ["tombol lain", { key: "/" }],
    ["dengan ⌘", { metaKey: true }],
    ["auto-repeat", { repeat: true }],
  ])("tidak: %s", (_name, overrides) => {
    expect(isShortcutsHelpKey(help(overrides))).toBe(false);
  });
});

describe("SHORTCUTS (daftar di dialog)", () => {
  it("tidak ada aksi ganda & tiap aksi punya tombol", () => {
    const actions = SHORTCUTS.map((s) => s.action);
    expect(new Set(actions).size).toBe(actions.length);
    for (const shortcut of SHORTCUTS)
      expect(shortcut.keys.length).toBeGreaterThan(0);
  });

  it("memuat pintasan yang dipegang listener global (Spasi, ⌘S, ⌘Z, ?)", () => {
    expect(isPlayPauseKey(space())).toBe(true);
    const keys = SHORTCUTS.flatMap((s) => s.keys);
    for (const key of ["Spasi", "⌘S", "⌘Z", "⌘⇧Z", "?"])
      expect(keys).toContain(key);
  });
});
