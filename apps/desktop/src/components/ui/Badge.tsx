import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

export type BadgeTone = "neutral" | "brand" | "cyan" | "ok" | "warn" | "danger" | "outline";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-elevated/65 text-muted",
  brand: "border-brand/30 bg-brand/10 text-brand-soft",
  cyan: "border-cyan/25 bg-cyan/10 text-cyan",
  ok: "border-ok/25 bg-ok/10 text-ok",
  warn: "border-warn/25 bg-warn/10 text-warn",
  danger: "border-danger/30 bg-danger/10 text-danger",
  outline: "border-line bg-transparent text-muted",
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  mono?: boolean;
  title?: string;
}

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  className,
  mono = false,
  title,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 tracking-[0.02em]",
        TONES[tone],
        mono && "font-mono",
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
