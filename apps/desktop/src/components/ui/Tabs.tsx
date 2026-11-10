import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  trailing?: ReactNode;
}

export function Tabs({ tabs, value, onChange, className, trailing }: TabsProps) {
  return (
    <div className={cx("flex items-end justify-between gap-4 border-b border-line", className)}>
      <div
        role="tablist"
        className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const tabs = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
          ).filter((tab) => !tab.disabled);
          if (tabs.length === 0) return;
          const current = tabs.findIndex((tab) => tab === document.activeElement);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : event.key === "ArrowRight"
                  ? (current + 1 + tabs.length) % tabs.length
                  : (current - 1 + tabs.length) % tabs.length;
          event.preventDefault();
          tabs[next]?.focus();
          tabs[next]?.click();
        }}
      >
        {tabs.map((tab) => {
          const active = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cx(
                "relative flex h-9 shrink-0 items-center gap-2 rounded-t-md px-2.5 text-xs font-medium transition-colors",
                active ? "text-text" : "text-muted hover:text-text",
              )}
            >
              {tab.label}
              {typeof tab.count === "number" ? (
                <span
                  className={cx(
                    "rounded px-1 py-0.5 text-[11px] tabular-nums",
                    active ? "bg-brand/15 text-brand-soft" : "bg-text/[0.05] text-muted",
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
              {active ? (
                <span className="absolute inset-x-1 -bottom-px h-px bg-brand" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2 pb-1.5">{trailing}</div> : null}
    </div>
  );
}
