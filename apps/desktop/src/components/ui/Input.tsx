import { Search, X } from "lucide-react";
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "../../lib/cx";

const FIELD_BASE =
  "w-full rounded-[10px] border border-line bg-surface/80 text-[13px] text-text transition-[border-color,box-shadow,background] placeholder:text-muted/55 hover:border-brand/25 focus:border-brand/55 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leadingIcon, trailing, containerClassName, ...props },
  ref,
) {
  if (!leadingIcon && !trailing) {
    return <input {...props} ref={ref} className={cx(FIELD_BASE, "h-10 px-3", className)} />;
  }
  return (
    <div className={cx("relative", containerClassName)}>
      {leadingIcon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          {leadingIcon}
        </span>
      ) : null}
      <input
        {...props}
        ref={ref}
        className={cx(FIELD_BASE, "h-10", leadingIcon ? "pl-9" : "px-3", trailing ? "pr-10" : "pr-3", className)}
      />
      {trailing ? <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</span> : null}
    </div>
  );
});

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  onClear?: () => void;
  containerClassName?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, onClear, value, containerClassName, ...props },
  ref,
) {
  return (
    <Input
      {...props}
      ref={ref}
      value={value}
      type="text"
      role="searchbox"
      containerClassName={containerClassName}
      leadingIcon={<Search className="size-4" aria-hidden="true" />}
      trailing={
        onClear && typeof value === "string" && value.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-text/[0.06] hover:text-text"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null
      }
      className={cx("h-10", className)}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        {...props}
        ref={ref}
        className={cx(FIELD_BASE, "min-h-24 resize-y px-3 py-2.5 font-mono text-xs leading-relaxed", className)}
      />
    );
  },
);

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, optional, children, className }: FieldProps) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[11px] font-medium text-muted">
          {label}
          {optional ? <span className="ml-1.5 font-normal text-muted/60">Optional</span> : null}
        </label>
        {error ? <span className="text-[10px] text-danger">{error}</span> : null}
      </div>
      {children}
      {hint ? <p className="text-[10px] leading-relaxed text-muted/70">{hint}</p> : null}
    </div>
  );
}
