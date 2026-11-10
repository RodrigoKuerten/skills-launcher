import { useId, useEffect, useRef, type ReactNode } from "react";import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "../../lib/cx";
import { IconButton } from "./IconButton";

const modalStack: symbol[] = [];

type DialogSize = "sm" | "md" | "lg" | "xl";

const WIDTHS: Record<DialogSize, string> = {
  sm: "sm:max-w-[430px]",
  md: "sm:max-w-[560px]",
  lg: "sm:max-w-[720px]",
  xl: "sm:max-w-[900px]",
};

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  position?: "center" | "right";
  className?: string;
  bodyClassName?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  position = "center",
  className,
  bodyClassName,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const stackId = useRef<symbol>(Symbol("modal"));
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = stackId.current;
    modalStack.push(id);
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = modalStack.lastIndexOf(id);
      if (index >= 0) modalStack.splice(index, 1);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  const sheet = position === "right";

  return createPortal(
    <div
      className={cx(
        "fixed inset-0 z-[100] flex",
        sheet ? "items-stretch justify-end" : "items-center justify-center p-4 sm:p-6",
      )}
    >
      <div
        className="absolute inset-0 animate-fade-in bg-black/65 backdrop-blur-[2px]"
        onMouseDown={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          "relative z-10 flex w-full flex-col border border-line bg-panel shadow-[0_30px_90px_-30px_rgba(0,0,0,0.9)] outline-none",
          sheet
            ? "h-full max-h-full max-w-[680px] animate-sheet-in rounded-none border-y-0 border-r-0"
            : cx("max-h-[85vh] animate-dialog-in rounded-[14px]", WIDTHS[size]),
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold tracking-[-0.01em] text-text">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-[11px] leading-relaxed text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            label="Close dialog"
            icon={<X className="size-4" aria-hidden="true" />}
            size="sm"
            onClick={() => onOpenChange(false)}
            className="-mr-1 -mt-0.5"
          />
        </div>
        <div className={cx("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/35 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function Sheet(props: Omit<DialogProps, "position">) {
  return <Dialog {...props} position="right" />;
}
