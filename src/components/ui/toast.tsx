"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, OctagonAlert, X } from "lucide-react";
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; title: string; description?: string };
type ToastApi = { show: (toast: Omit<ToastItem, "id">) => void };

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CheckCircle2, error: OctagonAlert, info: Info };
const TONES = { success: "text-success", error: "text-danger", info: "text-info" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = nextId.current++;
      setItems((all) => [...all.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === "error" ? 8000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {items.map((toast) => {
            const Icon = ICONS[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                role={toast.tone === "error" ? "alert" : "status"}
                className="pointer-events-auto flex gap-3 rounded-lg border border-line-strong bg-surface-overlay p-3.5 shadow-[var(--shadow-overlay)]"
              >
                <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", TONES[toast.tone])} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-fg">{toast.title}</p>
                  {toast.description ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{toast.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="-m-1 h-fit rounded p-1 text-fg-muted hover:text-fg"
                  aria-label="Dismiss notification"
                >
                  <X className="size-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const api = use(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}
