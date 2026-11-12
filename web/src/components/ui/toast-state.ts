export type ToastVariant = "info" | "success" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  variant?: ToastVariant;
  /** Judul tebal singkat, mis. "Gagal menyimpan." */
  title: string;
  description?: string;
  actions?: readonly ToastAction[];
  /** Toast dengan `key` yang sama menggantikan yang lama (mis. render gagal berulang). */
  key?: string;
}

export interface Toast extends ToastInput {
  id: string;
  variant: ToastVariant;
}

export const MAX_TOASTS = 3;
export const AUTO_DISMISS_MS = 6000;

/** Galat menetap sampai ditutup; info/sukses hilang sendiri. */
export const autoDismissMs = (toast: Pick<Toast, "variant">): number | null =>
  toast.variant === "error" ? null : AUTO_DISMISS_MS;

export type ToastEvent =
  { type: "push"; toast: Toast } | { type: "dismiss"; id: string };

/**
 * Antrean toast, yang lama di depan. Batas `MAX_TOASTS`: yang disingkirkan adalah toast tertua
 * yang bukan galat; galat baru bisa mengusir galat tertua hanya bila semuanya galat.
 */
export function toastReducer(
  state: readonly Toast[],
  action: ToastEvent,
): Toast[] {
  if (action.type === "dismiss")
    return state.filter((toast) => toast.id !== action.id);
  const { toast } = action;
  const kept =
    toast.key === undefined
      ? [...state]
      : state.filter((existing) => existing.key !== toast.key);
  const next = [...kept, toast];
  while (next.length > MAX_TOASTS) {
    const evict = next.findIndex(
      (candidate, index) =>
        index < next.length - 1 && candidate.variant !== "error",
    );
    next.splice(evict === -1 ? 0 : evict, 1);
  }
  return next;
}
