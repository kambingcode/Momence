"use client";

import { cn } from "cn";
import { Check, CircleAlert, Info, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  autoDismissMs,
  type Toast,
  type ToastInput,
  toastReducer,
} from "./toast-state";

interface ToastApi {
  /** Tampilkan toast; mengembalikan id-nya (untuk `dismiss`). */
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = React.useContext(ToastContext);
  if (!api) throw new Error("useToast harus dipakai di dalam <ToastProvider>");
  return api;
}

/**
 * Antrean toast + wadahnya di pojok kiri bawah (`fixed`, jadi tidak menggeser tata letak).
 * Pengumuman lewat `role="status"` (info/sukses) atau `role="alert"` (galat); fokus tidak dipindah.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = React.useReducer(toastReducer, []);
  const counter = React.useRef(0);
  const dismiss = React.useCallback(
    (id: string) => dispatch({ type: "dismiss", id }),
    [],
  );
  const toast = React.useCallback((input: ToastInput) => {
    counter.current += 1;
    const id = `toast-${counter.current}`;
    dispatch({
      type: "push",
      toast: { ...input, id, variant: input.variant ?? "info" },
    });
    return id;
  }, []);
  const api = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        data-slot="toaster"
        aria-label="Pemberitahuan"
        className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} toast={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICON = { info: Info, success: Check, error: CircleAlert } as const;

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = React.useState(false);
  const timeout = autoDismissMs(toast);
  React.useEffect(() => {
    if (timeout === null || paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), timeout);
    return () => window.clearTimeout(timer);
  }, [timeout, paused, onDismiss, toast.id]);

  const isError = toast.variant === "error";
  const Icon = ICON[toast.variant];
  return (
    <div
      role={isError ? "alert" : "status"}
      data-slot="toast"
      data-variant={toast.variant}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-xl border bg-background p-3 text-sm shadow-sm",
        isError && "border-destructive",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          isError ? "text-destructive" : "text-foreground",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="break-words">
          {toast.title}
          {toast.description && (
            <span className="text-muted-foreground"> {toast.description}</span>
          )}
        </p>
        {toast.actions && toast.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {toast.actions.map((action, index) => (
              <Button
                key={action.label}
                size="xs"
                variant={index === 0 ? "outline" : "ghost"}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Tutup pemberitahuan"
        onClick={() => onDismiss(toast.id)}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}
