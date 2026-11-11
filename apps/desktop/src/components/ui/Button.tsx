import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cx } from "../../lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border border-brand/70 bg-brand text-white shadow-[0_10px_30px_-16px_rgba(47,107,255,0.9)] hover:border-brand-strong hover:bg-brand-strong active:translate-y-px",
  secondary:
    "border border-line bg-elevated/60 text-text hover:border-brand/35 hover:bg-elevated active:translate-y-px",
  ghost: "border border-transparent text-muted hover:bg-text/[0.055] hover:text-text",
  danger:
    "border border-danger/30 bg-danger/10 text-danger hover:border-danger/50 hover:bg-danger/15 active:translate-y-px",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-2.5 text-xs",
  md: "h-9 gap-2 rounded-[10px] px-3.5 text-[13px]",
  lg: "h-11 gap-2 rounded-[11px] px-5 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex select-none items-center justify-center font-medium transition-[background,border-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
