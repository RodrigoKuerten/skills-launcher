import { cx } from "../../lib/cx";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}

export function Switch({ checked, onCheckedChange, disabled = false, label, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-brand/70 bg-brand" : "border-line bg-elevated",
        className,
      )}
    >
      <span
        className={cx(
          "pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform duration-150",
          checked ? "translate-x-[18px]" : "translate-x-[3px]",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
