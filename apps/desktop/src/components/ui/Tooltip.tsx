import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

export interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: "top" | "right";
  hideOnLarge?: boolean;
  className?: string;
}

export function Tooltip({ label, children, side = "top", hideOnLarge = false, className }: TooltipProps) {
  return (
    <span className={cx("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cx(
          "pointer-events-none absolute z-[70] scale-[0.96] whitespace-nowrap rounded-md border border-line bg-elevated px-2 py-1 text-[11px] font-medium text-text opacity-0 shadow-xl transition-[opacity,transform] duration-200 ease-[var(--ease-out)] group-hover/tt:scale-100 group-hover/tt:opacity-100 group-focus-within/tt:scale-100 group-focus-within/tt:opacity-100",
          side === "top"
            ? "bottom-full left-1/2 mb-2 -translate-x-1/2"
            : "left-full top-1/2 ml-2.5 -translate-y-1/2",
          hideOnLarge && "lg:hidden",
        )}
      >
        {label}
      </span>
    </span>
  );
}
