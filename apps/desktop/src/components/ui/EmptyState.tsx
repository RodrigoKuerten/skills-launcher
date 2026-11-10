import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  hint?: string;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  hint,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-[14px] border border-dashed border-line bg-surface/35 text-center",
        compact ? "px-5 py-7" : "px-6 py-11",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-32 w-72 -translate-x-1/2 rounded-full bg-brand/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex max-w-md flex-col items-center">
        <span className="mb-4 grid size-10 place-items-center rounded-xl border border-line bg-elevated/70 text-brand-soft">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-semibold tracking-[-0.01em] text-text">{title}</h3>
        {description ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{description}</p>
        ) : null}
        {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
        {hint ? <p className="mt-4 text-[11px] leading-relaxed text-muted-soft">{hint}</p> : null}
      </div>
    </div>
  );
}
