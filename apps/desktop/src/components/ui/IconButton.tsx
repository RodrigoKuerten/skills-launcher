import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  variant?: "ghost" | "secondary" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  tooltip?: string;
}

export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  loading = false,
  disabled,
  className,
  tooltip,
  type = "button",
  ...props
}: IconButtonProps) {
  const variantClass =
    variant === "secondary"
      ? "border border-line bg-elevated/50 text-muted hover:border-brand/30 hover:text-text"
      : variant === "danger"
        ? "border border-transparent text-muted hover:border-danger/30 hover:bg-danger/10 hover:text-danger"
        : "border border-transparent text-muted hover:bg-text/[0.06] hover:text-text";

  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={tooltip ?? label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "size-7" : "size-8",
        variantClass,
        className,
      )}
    >
      {loading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : icon}
    </button>
  );
}
