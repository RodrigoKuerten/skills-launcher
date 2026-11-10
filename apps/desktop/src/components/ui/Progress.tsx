import { cx } from "../../lib/cx";

export interface ProgressProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  tone?: "brand" | "ok" | "warn" | "danger";
  className?: string;
}

const TONES = {
  brand: "bg-brand",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
};

export function Progress({
  value,
  max = 100,
  label,
  showValue = false,
  tone = "brand",
  className,
}: ProgressProps) {
  const safeMax = max > 0 ? max : 100;
  const percent = Math.max(0, Math.min(100, (value / safeMax) * 100));
  return (
    <div className={cx("space-y-1.5", className)}>
      {label || showValue ? (
        <div className="flex items-center justify-between gap-3 text-[10px]">
          {label ? <span className="text-muted">{label}</span> : <span />}
          {showValue ? (
            <span className="font-mono tabular-nums text-muted">
              {Math.round(value)}/{max}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-line/60"
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? "Progress"}
      >
        <div
          className={cx("h-full rounded-full transition-[width] duration-300", TONES[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
