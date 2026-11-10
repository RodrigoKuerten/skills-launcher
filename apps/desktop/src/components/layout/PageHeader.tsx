import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cx("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0 max-w-2xl">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-brand-soft/80">
          {eyebrow}
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.03em] text-text">
            {title}
          </h1>
          {meta ? <div className="flex items-center gap-2 text-[11px] text-muted">{meta}</div> : null}
        </div>
        {description ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
