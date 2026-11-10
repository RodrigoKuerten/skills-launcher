import type { LucideIcon } from "lucide-react";
import { cx } from "../lib/cx";
import { formatNumber } from "../lib/format";

export interface StatProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "brand" | "ok" | "warn" | "danger" | "muted";
  className?: string;
}

const TONES = {
  brand: "text-brand-soft",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  muted: "text-muted",
};

export function Stat({ icon: Icon, label, value, hint, tone = "brand", className }: StatProps) {
  return (
    <div className={cx("flex min-w-0 items-start gap-3", className)}>
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-elevated/55">
        <Icon className={cx("size-3.5", TONES[tone])} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-6 tracking-[-0.02em] tabular-nums text-text">
          {typeof value === "number" ? formatNumber(value) : value}
        </p>
        <p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
        {hint ? <p className="mt-1 truncate text-[10px] text-muted/65">{hint}</p> : null}
      </div>
    </div>
  );
}
