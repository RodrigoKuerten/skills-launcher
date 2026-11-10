"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; title: string; description?: string };

const ToastContext = createContext<{
  toast: (kind: ToastKind, title: string, description?: string) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const toast = useCallback(
    (kind: ToastKind, title: string, description?: string) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current.slice(-2), { id, kind, title, description }]);
      // Errors stay until dismissed; WCAG 2.2.1 timing is not applied to failures.
      if (kind !== "error") {
        timers.current.set(
          id,
          setTimeout(() => remove(id), 5000),
        );
      }
    },
    [remove],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4 sm:right-4 sm:left-auto sm:items-end">
        {toasts.map((item) => (
          <div
            key={item.id}
            role={item.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-card p-3.5 shadow-2xl anim-fade-up"
          >
            <span
              className={cn("mt-0.5 shrink-0", {
                "text-success": item.kind === "success",
                "text-danger": item.kind === "error",
                "text-accent": item.kind === "info",
              })}
            >
              {item.kind === "success" ? (
                <CircleCheck className="size-4" />
              ) : item.kind === "error" ? (
                <CircleAlert className="size-4" />
              ) : (
                <Info className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{item.title}</p>
              {item.description ? <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
