import { Info } from "lucide-react";
import { useState } from "react";
import { cx } from "../lib/cx";
import type { RiskLevel } from "../lib/types";
import { RiskGlyph } from "./RiskGlyph";
import { RiskInfoDialog } from "./RiskInfoDialog";
import { Badge, type BadgeTone } from "./ui/Badge";

const TONES: Record<string, BadgeTone> = {
  LOW: "ok",
  MEDIUM: "warn",
  HIGH: "danger",
  CRITICAL: "danger",
};

const LABELS: Record<string, string> = {
  LOW: "Low risk",
  MEDIUM: "Medium risk",
  HIGH: "High risk",
  CRITICAL: "Critical risk",
};

export function RiskBadge({ risk, className }: { risk: RiskLevel | string; className?: string }) {
  const [open, setOpen] = useState(false);
  const label = LABELS[risk] ?? risk;

  return (
    <>
      <button
        type="button"
        data-risk-info
        className={cx(
          "group/risk inline-flex cursor-help appearance-none rounded-md bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          className,
        )}
        aria-label={`${label}: view what this risk level means`}
        aria-haspopup="dialog"
        title="View what this risk level means"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Badge
          tone={TONES[risk] ?? "neutral"}
          className="transition-[border-color,background-color,color] duration-150 group-hover/risk:brightness-110 hover:border-current/40 hover:bg-current/10"
        >
          <RiskGlyph risk={risk} className="size-3" />
          {label}
          <Info className="size-2.5 opacity-60" aria-hidden="true" />
        </Badge>
      </button>
      <RiskInfoDialog risk={risk} open={open} onOpenChange={setOpen} />
    </>
  );
}
