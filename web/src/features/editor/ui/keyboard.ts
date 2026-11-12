/** Bentuk minimal elemen DOM yang dibutuhkan pengecekan pintasan (mudah dipalsukan di tes). */
interface TargetLike {
  tagName: string;
  isContentEditable?: boolean;
  getAttribute(name: string): string | null;
  closest(selector: string): unknown;
}

const asTarget = (target: EventTarget | null): TargetLike | null =>
  target !== null &&
  typeof target === "object" &&
  "tagName" in target &&
  "closest" in target
    ? (target as unknown as TargetLike)
    : null;

/** Input teks (mis. popover koreksi) memakai undo & spasi bawaan browser. */
export const isTextInput = (target: EventTarget | null) => {
  const element = asTarget(target);
  return (
    element !== null &&
    (element.isContentEditable === true ||
      element.tagName === "INPUT" ||
      element.tagName === "TEXTAREA" ||
      element.tagName === "SELECT")
  );
};

const INTERACTIVE_TAGS = new Set(["BUTTON", "A", "SUMMARY"]);
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "combobox",
]);
/** Di dalam lapisan ini Space milik dialog/menu, bukan pemutar. */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Elemen yang sudah memakai Space sendiri (tombol, link, kontrol form, dialog), sehingga
 * pintasan global tidak boleh merebutnya. Panel transkrip (`role="textbox"` tanpa
 * contentEditable) bukan termasuk.
 */
export const isInteractiveTarget = (target: EventTarget | null) => {
  const element = asTarget(target);
  if (element === null) return false;
  if (isTextInput(target) || INTERACTIVE_TAGS.has(element.tagName)) return true;
  const role = element.getAttribute("role");
  if (role !== null && INTERACTIVE_ROLES.has(role)) return true;
  return element.closest(OVERLAY_SELECTOR) !== null;
};

/** Di dalam dialog/menu: pintasan global (⌘S, ⌘Z, …) tidak boleh bereaksi. */
export const isInOverlay = (target: EventTarget | null) =>
  asTarget(target)?.closest(OVERLAY_SELECTOR) != null;

/** Space tanpa modifier & bukan auto-repeat, di luar elemen interaktif → putar/jeda. */
export const isPlayPauseKey = (
  event: Pick<
    KeyboardEvent,
    | "code"
    | "key"
    | "repeat"
    | "metaKey"
    | "ctrlKey"
    | "altKey"
    | "shiftKey"
    | "target"
  >,
) =>
  (event.code === "Space" || event.key === " ") &&
  !event.repeat &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey &&
  !event.shiftKey &&
  !isInteractiveTarget(event.target);

/** "?" tanpa Ctrl/⌘/Alt, di luar elemen interaktif → buka daftar pintasan. */
export const isShortcutsHelpKey = (
  event: Pick<
    KeyboardEvent,
    "key" | "repeat" | "metaKey" | "ctrlKey" | "altKey" | "target"
  >,
) =>
  event.key === "?" &&
  !event.repeat &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey &&
  !isInteractiveTarget(event.target);
