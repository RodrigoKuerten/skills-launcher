import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cx } from "../../lib/cx";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

export interface ToastApi {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
};

const TONES = {
  success: "border-ok/30 bg-panel text-ok",
  error: "border-danger/35 bg-panel text-danger",
  info: "border-brand/30 bg-panel text-brand-soft",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());
  const lastKey = useRef<string | null>(null);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const key = `${kind}:${title}:${message ?? ""}`;
      if (lastKey.current === key) return;
      lastKey.current = key;
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, kind, title, message }]);
      const timeout = window.setTimeout(() => {
        lastKey.current = null;
        dismiss(id);
      }, kind === "error" ? 7200 : 4200);
      timers.current.set(id, timeout);
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((timer) => window.clearTimeout(timer));
      active.clear();
    };
  }, []);

  const api: ToastApi = {
    success: (title, message) => push("success", title, message),
    error: (title, message) => push("error", title, message),
    info: (title, message) => push("info", title, message),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed bottom-5 right-5 z-[200] flex w-[min(390px,calc(100vw-40px))] flex-col gap-2"
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((toast) => {
            const Icon = ICONS[toast.kind];
            return (
              <div
                key={toast.id}
                role={toast.kind === "error" ? "alert" : "status"}
                className={cx(
                  "pointer-events-auto flex animate-toast-in items-start gap-3 rounded-[11px] border px-3.5 py-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]",
                  TONES[toast.kind],
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-text">{toast.title}</p>
                  {toast.message ? (
                    <p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted">
                      {toast.message}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="grid size-6 shrink-0 place-items-center rounded text-muted transition-colors hover:bg-white/5 hover:text-text"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
